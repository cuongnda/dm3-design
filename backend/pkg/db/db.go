package db

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	Pool *pgxpool.Pool
	dsn  string
}

func Connect(ctx context.Context, dsn string) (*DB, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("db connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("db ping: %w", err)
	}
	slog.Info("connected to database")
	return &DB{Pool: pool, dsn: dsn}, nil
}

func (d *DB) Close() {
	d.Pool.Close()
}

// RunMigrations applies pending database migrations using golang-migrate.
// If the database is in a dirty state (failed migration), it automatically
// rolls back to the last clean version so migration can resume on restart.
func (d *DB) RunMigrations(dir string) error {
	m, err := migrate.New("file://"+dir, d.dsn)
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
