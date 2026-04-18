package objectstore

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Config struct {
	Endpoint         string
	AccessKeyID      string
	SecretAccessKey  string
	Bucket           string
	UseSSL           bool
	AutoCreateBucket bool
}

type ObjectInfo struct {
	ContentType string
	Size        int64
	ETag        string
}

type Store interface {
	PutObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) error
	GetObject(ctx context.Context, key string) (io.ReadCloser, ObjectInfo, error)
	DeleteObject(ctx context.Context, key string) error
}

type MinIOStore struct {
	client *minio.Client
	bucket string
}

func NewMinIOStore(ctx context.Context, cfg Config) (*MinIOStore, error) {
	if strings.TrimSpace(cfg.Endpoint) == "" {
		return nil, fmt.Errorf("object store endpoint is required")
	}
	if strings.TrimSpace(cfg.AccessKeyID) == "" {
		return nil, fmt.Errorf("object store access key is required")
	}
	if strings.TrimSpace(cfg.SecretAccessKey) == "" {
		return nil, fmt.Errorf("object store secret key is required")
	}
	if strings.TrimSpace(cfg.Bucket) == "" {
		return nil, fmt.Errorf("object store bucket is required")
	}

	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}

	store := &MinIOStore{client: client, bucket: cfg.Bucket}
	if cfg.AutoCreateBucket {
		exists, err := client.BucketExists(ctx, cfg.Bucket)
		if err != nil {
			return nil, fmt.Errorf("check minio bucket: %w", err)
		}
		if !exists {
			if err := client.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{}); err != nil {
				return nil, fmt.Errorf("create minio bucket: %w", err)
			}
		}
	}

	return store, nil
}

func (s *MinIOStore) PutObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, body, size, minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return fmt.Errorf("put object %s: %w", key, err)
	}
	return nil
}

func (s *MinIOStore) GetObject(ctx context.Context, key string) (io.ReadCloser, ObjectInfo, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, ObjectInfo{}, fmt.Errorf("get object %s: %w", key, err)
	}
	info, err := obj.Stat()
	if err != nil {
		_ = obj.Close()
		return nil, ObjectInfo{}, fmt.Errorf("stat object %s: %w", key, err)
	}
	return obj, ObjectInfo{ContentType: info.ContentType, Size: info.Size, ETag: info.ETag}, nil
}

func (s *MinIOStore) DeleteObject(ctx context.Context, key string) error {
	if strings.TrimSpace(key) == "" {
		return nil
	}
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("delete object %s: %w", key, err)
	}
	return nil
}
