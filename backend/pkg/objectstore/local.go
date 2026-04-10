package objectstore

import (
	"context"
	"crypto/md5"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// LocalStore implements Store by writing files to a local directory.
type LocalStore struct {
	baseDir string
}

// NewLocalStore creates a local filesystem-backed object store.
// baseDir is the root directory where files will be stored.
func NewLocalStore(baseDir string) (*LocalStore, error) {
	if strings.TrimSpace(baseDir) == "" {
		return nil, fmt.Errorf("local store base directory is required")
	}
	if err := os.MkdirAll(baseDir, 0o755); err != nil {
		return nil, fmt.Errorf("create local store directory: %w", err)
	}
	return &LocalStore{baseDir: baseDir}, nil
}

func (s *LocalStore) PutObject(_ context.Context, key string, body io.Reader, _ int64, contentType string) error {
	fullPath := filepath.Join(s.baseDir, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return fmt.Errorf("create directories for %s: %w", key, err)
	}

	f, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("create file %s: %w", key, err)
	}
	defer f.Close()

	if _, err := io.Copy(f, body); err != nil {
		return fmt.Errorf("write file %s: %w", key, err)
	}
	return nil
}

func (s *LocalStore) GetObject(_ context.Context, key string) (io.ReadCloser, ObjectInfo, error) {
	fullPath := filepath.Join(s.baseDir, filepath.FromSlash(key))

	f, err := os.Open(fullPath)
	if err != nil {
		return nil, ObjectInfo{}, fmt.Errorf("open file %s: %w", key, err)
	}

	stat, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, ObjectInfo{}, fmt.Errorf("stat file %s: %w", key, err)
	}

	ct := mime.TypeByExtension(filepath.Ext(fullPath))
	if ct == "" {
		// Sniff content type from first 512 bytes
		buf := make([]byte, 512)
		n, _ := f.Read(buf)
		ct = http.DetectContentType(buf[:n])
		_, _ = f.Seek(0, io.SeekStart)
	}

	etag := fmt.Sprintf(`"%x"`, md5.Sum([]byte(key+stat.ModTime().String())))

	return f, ObjectInfo{
		ContentType: ct,
		Size:        stat.Size(),
		ETag:        etag,
	}, nil
}

func (s *LocalStore) DeleteObject(_ context.Context, key string) error {
	if strings.TrimSpace(key) == "" {
		return nil
	}
	fullPath := filepath.Join(s.baseDir, filepath.FromSlash(key))
	err := os.Remove(fullPath)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
