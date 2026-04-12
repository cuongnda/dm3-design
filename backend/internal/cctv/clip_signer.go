package cctv

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// minioPresigner is the subset of the minio.Client API needed for presigned URLs.
// Defined here so tests can substitute a fake.
type minioPresigner interface {
	PresignedGetObject(ctx context.Context, bucketName, objectName string, expires time.Duration, reqParams url.Values) (*url.URL, error)
}

// ObjectStoreClipSigner implements ClipSigner using a MinIO client to produce
// presigned GET URLs with a 5-minute expiry.
type ObjectStoreClipSigner struct {
	client     minioPresigner
	bucketName string
	expiry     time.Duration
}

// NewObjectStoreClipSigner constructs an ObjectStoreClipSigner backed by a real MinIO client.
// endpoint, accessKey, secretKey and bucket come from config.
func NewObjectStoreClipSigner(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*ObjectStoreClipSigner, error) {
	if endpoint == "" {
		return nil, fmt.Errorf("clip signer: endpoint is required")
	}
	if bucket == "" {
		return nil, fmt.Errorf("clip signer: bucket is required")
	}
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("clip signer: create minio client: %w", err)
	}
	return &ObjectStoreClipSigner{
		client:     client,
		bucketName: bucket,
		expiry:     5 * time.Minute,
	}, nil
}

// Sign returns a presigned GET URL for the given object key, valid for 5 minutes.
func (s *ObjectStoreClipSigner) Sign(ctx context.Context, objectKey string) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	u, err := s.client.PresignedGetObject(ctx, s.bucketName, objectKey, s.expiry, nil)
	if err != nil {
		return "", fmt.Errorf("clip signer: presign object %q: %w", objectKey, err)
	}
	return u.String(), nil
}
