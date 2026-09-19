import {
  head,
  issueSignedToken,
  presignUrl,
  type HeadBlobResult,
} from "@vercel/blob";

const SOURCE_PREFIX = "audio/source/";
const EXPORT_PREFIX = "audio/export/";
const DEFAULT_DOWNLOAD_TTL_SECONDS = 300;

export type OwnedBlobKind = "source" | "export";

export interface OwnedBlobReference {
  readonly projectId: string;
  readonly sessionId: string;
  readonly key: string;
  readonly kind: OwnedBlobKind;
}

export interface BlobAccessContext {
  readonly projectId: string;
  readonly sessionId: string;
  readonly reference: OwnedBlobReference;
}

export interface PrivateBlobLookup {
  readonly metadata: HeadBlobResult;
  readonly reference: OwnedBlobReference;
}

export class BlobAccessError extends Error {
  constructor() {
    super("The requested audio object is unavailable.");
    this.name = "BlobAccessError";
  }
}

function isSafeBlobKey(key: string, kind: OwnedBlobKind): boolean {
  const prefix = kind === "source" ? SOURCE_PREFIX : EXPORT_PREFIX;

  return (
    key.startsWith(prefix) &&
    !key.includes("..") &&
    !key.includes("\\") &&
    !key.includes("?") &&
    !key.includes("#") &&
    !key.includes("://") &&
    key.length > prefix.length
  );
}

function assertOwnedReference(
  context: BlobAccessContext,
): asserts context is BlobAccessContext {
  const { reference } = context;

  if (
    context.projectId !== reference.projectId ||
    context.sessionId !== reference.sessionId ||
    !isSafeBlobKey(reference.key, reference.kind)
  ) {
    throw new BlobAccessError();
  }
}

function getBlobToken(token?: string): string {
  const resolvedToken = token ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (!resolvedToken) {
    throw new BlobAccessError();
  }
  return resolvedToken;
}

export async function lookupPrivateBlob(
  context: BlobAccessContext,
  token?: string,
): Promise<PrivateBlobLookup> {
  assertOwnedReference(context);

  try {
    const metadata = await head(context.reference.key, {
      token: getBlobToken(token),
    });

    return { metadata, reference: context.reference };
  } catch {
    throw new BlobAccessError();
  }
}

export async function createPrivateDownloadUrl(
  context: BlobAccessContext,
  token?: string,
  ttlSeconds = DEFAULT_DOWNLOAD_TTL_SECONDS,
): Promise<string> {
  assertOwnedReference(context);

  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new BlobAccessError();
  }

  const now = Date.now();
  const validUntil = now + ttlSeconds * 1000;
  const blobToken = getBlobToken(token);

  try {
    const signedToken = await issueSignedToken({
      pathname: context.reference.key,
      operations: ["get"],
      validUntil,
      token: blobToken,
    });
    const result = await presignUrl(signedToken, {
      access: "private",
      operation: "get",
      pathname: context.reference.key,
      validUntil: Math.min(validUntil, signedToken.validUntil),
    });

    return result.presignedUrl;
  } catch {
    throw new BlobAccessError();
  }
}
