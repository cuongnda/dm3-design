package objectstore

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Config struct {
	Endpoint         string
	// PublicEndpoint, when set, is the host:port baked into presigned URLs
	// returned to devices and browsers. Use this when the gateway talks to
	// MinIO over a docker-internal hostname (e.g. minio:9000) but the device
	// must reach it over the LAN/WAN at a different address (e.g.
	// 192.168.1.254:9002 or s3.dm3.example.com). Falls back to Endpoint when
	// empty.
	PublicEndpoint   string
	AccessKeyID      string
	SecretAccessKey  string
	Bucket           string
	UseSSL           bool
	// PublicUseSSL controls the scheme of presigned URLs. Falls back to
	// UseSSL when not explicitly set in config.
	PublicUseSSL     bool
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

// GetURLPresigner is the optional capability of issuing time-limited GET URLs.
// MinIOStore implements it; LocalStore does not. Callers should type-assert
// before use so dev environments without object storage still compile and run.
type GetURLPresigner interface {
	PresignedGetURL(ctx context.Context, key string, expires time.Duration) (*url.URL, error)
}

type MinIOStore struct {
	// client talks to MinIO from inside the platform (docker network, internal
	// VPC). All real GET/PUT/DELETE operations go through it.
	client *minio.Client
	// presignClient is constructed with the public endpoint, so the URLs it
	// generates point at an address that devices and browsers can actually
	// reach. It is never used for live S3 calls — only for URL generation.
	// When Config.PublicEndpoint is empty, this is the same as `client`.
	presignClient *minio.Client
	bucket        string
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

	presignClient := client
	if strings.TrimSpace(cfg.PublicEndpoint) != "" {
		presignClient, err = minio.New(cfg.PublicEndpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
			Secure: cfg.PublicUseSSL,
			// Force path-style so nginx fronted by a custom subdomain
			// (dm3-s3.demasterpro.com/<bucket>/<key>) doesn't return
			// 301 Moved Permanently on the SDK's virtual-hosted-style
			// bucket lookup.
			BucketLookup: minio.BucketLookupPath,
			Region:       "us-east-1",
		})
		if err != nil {
			return nil, fmt.Errorf("create minio presign client: %w", err)
		}
	}

	store := &MinIOStore{client: client, presignClient: presignClient, bucket: cfg.Bucket}
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

// PresignedPutURL returns a presigned PUT URL the client can upload to directly,
// bypassing the gateway. Used by edge devices to stream snapshots/clips into
// MinIO without buffering binary payloads through any Go service.
func (s *MinIOStore) PresignedPutURL(ctx context.Context, key string, expires time.Duration) (*url.URL, error) {
	if strings.TrimSpace(key) == "" {
		return nil, fmt.Errorf("presign put: key is required")
	}
	u, err := s.presignClient.PresignedPutObject(ctx, s.bucket, key, expires)
	if err != nil {
		return nil, fmt.Errorf("presign put %s: %w", key, err)
	}
	return u, nil
}

// PresignedGetURL returns a presigned GET URL for reading an object — used by
// the frontend to render snapshots/clips directly from MinIO. Mirrors the
// CCTV ObjectStoreClipSigner pattern but lives on the shared store.
func (s *MinIOStore) PresignedGetURL(ctx context.Context, key string, expires time.Duration) (*url.URL, error) {
	if strings.TrimSpace(key) == "" {
		return nil, fmt.Errorf("presign get: key is required")
	}
	u, err := s.presignClient.PresignedGetObject(ctx, s.bucket, key, expires, nil)
	if err != nil {
		return nil, fmt.Errorf("presign get %s: %w", key, err)
	}
	return u, nil
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
