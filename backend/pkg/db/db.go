package db

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/url"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// dm3MigrationLockID is a unique advisory lock ID used to serialize migrations across services.
const dm3MigrationLockID = 0x444D3300 // "DM3\0"

type DB struct {
	Pool *pgxpool.Pool
	dsn  string
}

const (
	connectMaxWait = 60 * time.Second
	connectRetry   = 2 * time.Second
)

// Connect establishes a connection pool, retrying until the database server is
// ready (up to 60 s). If the target database does not exist on the first
// successful server contact, it is created automatically — 42P04 ("already
// exists") from concurrent services is silently ignored.
func Connect(ctx context.Context, dsn string) (*DB, error) {
	dbName, adminDSN := extractDBName(dsn)

	deadline := time.Now().Add(connectMaxWait)
	var lastErr error

	for {
		// Try direct connection first (common case: DB already exists).
		pool, err := pgxpool.New(ctx, dsn)
		if err == nil {
			if pingErr := pool.Ping(ctx); pingErr == nil {
				slog.Info("connected to database")
				return &DB{Pool: pool, dsn: dsn}, nil
			}
			pool.Close()
		}

		// Postgres might not be ready yet OR the database doesn't exist yet.
		// Try connecting to the admin DB to distinguish the two cases.
		if dbName != "" && adminDSN != "" {
			if createErr := createDatabase(ctx, adminDSN, dbName); createErr == nil {
				// Admin DB reachable — target DB now exists. Try connecting again.
				pool2, err2 := pgxpool.New(ctx, dsn)
				if err2 == nil {
					if pingErr := pool2.Ping(ctx); pingErr == nil {
						slog.Info("database created and connected", "database", dbName)
						return &DB{Pool: pool2, dsn: dsn}, nil
					}
					pool2.Close()
					lastErr = fmt.Errorf("ping after create failed")
				} else {
					lastErr = err2
				}
			} else {
				lastErr = createErr
			}
		} else {
			lastErr = fmt.Errorf("db connect: %w", err)
		}

		if time.Now().After(deadline) {
			return nil, fmt.Errorf("db connect timeout after %s: %w", connectMaxWait, lastErr)
		}

		slog.Warn("database not ready, retrying", "error", lastErr, "retry_in", connectRetry)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(connectRetry):
		}
	}
}

// extractDBName returns the database name and a DSN pointing to the "postgres" admin DB.
func extractDBName(dsn string) (string, string) {
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return "", ""
	}
	dbName := cfg.Database
	if dbName == "" {
		return "", ""
	}
	// Parse as URL and replace only the path (database name) to avoid
	// corrupting user/password that may contain similar substrings.
	u, err := url.Parse(dsn)
	if err != nil {
		return "", ""
	}
	u.Path = "/postgres"
	return dbName, u.String()
}

// createDatabase connects to the admin DB and creates the target database.
func createDatabase(ctx context.Context, adminDSN, dbName string) error {
	conn, err := pgx.Connect(ctx, adminDSN)
	if err != nil {
		return fmt.Errorf("connect to admin db: %w", err)
	}
	defer conn.Close(ctx)

	_, err = conn.Exec(ctx, fmt.Sprintf("CREATE DATABASE %s", pgx.Identifier{dbName}.Sanitize()))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "42P04" {
			// Database already exists — another service created it first, that's fine.
			return nil
		}
		return err
	}
	return nil
}

func (d *DB) Close() {
	d.Pool.Close()
}

// RunMigrations applies pending database migrations using golang-migrate.
// It acquires a PostgreSQL advisory lock so that when multiple services start
// simultaneously only one runs migrations at a time; others wait and then skip
// (ErrNoChange) once the lock is released.
// If the database is in a dirty state (failed migration), it automatically
// rolls back to the last clean version so migration can resume on restart.
func (d *DB) RunMigrations() error {
	ctx := context.Background()

	// Acquire advisory lock — blocks until the lock is available.
	conn, err := d.Pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("migrate acquire conn: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", dm3MigrationLockID); err != nil {
		return fmt.Errorf("migrate advisory lock: %w", err)
	}
	defer func() {
		_, _ = conn.Exec(ctx, "SELECT pg_advisory_unlock($1)", dm3MigrationLockID)
	}()

	sub, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("migrate fs: %w", err)
	}
	src, err := iofs.New(sub, ".")
	if err != nil {
		return fmt.Errorf("migrate iofs: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, d.dsn)
	if err != nil {
		return fmt.Errorf("migrate init: %w", err)
	}
	defer m.Close()

	// Auto-fix dirty state: force back to the last clean version so m.Up() can proceed.
	version, dirty, vErr := m.Version()
	if vErr == nil && dirty {
		slog.Warn("dirty migration state detected, rolling back to last clean version",
			"dirty_version", version)
		if err := m.Force(int(version) - 1); err != nil {
			return fmt.Errorf("migrate force clean: %w", err)
		}
	}

	versionBefore, _, _ := m.Version()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate up: %w", err)
	}

	version, dirty, _ = m.Version()
	if version != versionBefore {
		slog.Info("migrations applied", "from", versionBefore, "to", version)
	} else {
		slog.Info("migrations up to date", "version", version)
	}
	if dirty {
		slog.Warn("database still dirty after migration", "version", version)
	}
	return nil
}
