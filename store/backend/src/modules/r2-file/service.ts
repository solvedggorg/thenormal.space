import { AbstractFileProviderService } from "@medusajs/framework/utils";

type Options = {
  fileUrl: string;
  apiUrl: string;
  secret: string;
};

type UploadFile = {
  filename: string;
  mimeType: string;
  content: string;
};

function asArrayBuffer(content: string): ArrayBuffer {
  const source = !content
    ? new Uint8Array()
    : /^[A-Za-z0-9+/=\r\n]+$/.test(content) && content.length % 4 === 0
      ? new Uint8Array(Buffer.from(content, "base64"))
      : new Uint8Array(Buffer.from(content, "binary"));
  const copy = new ArrayBuffer(source.byteLength);
  new Uint8Array(copy).set(source);
  return copy;
}

class R2FileProviderService extends AbstractFileProviderService {
  static identifier = "r2";

  protected fileUrl: string;
  protected apiUrl: string;
  protected secret: string;

  constructor(_deps: unknown, options: Options) {
    super();
    this.fileUrl = (options.fileUrl || "").replace(/\/$/, "");
    this.apiUrl = (options.apiUrl || "").replace(/\/$/, "");
    this.secret = options.secret || "";
    if (!this.fileUrl || !this.apiUrl || !this.secret) {
      throw new Error("R2 file provider needs fileUrl, apiUrl, and secret.");
    }
  }

  async upload(file: UploadFile): Promise<{ url: string; key: string }> {
    const safeName = (file.filename || "file").replace(/[^a-zA-Z0-9._-]+/g, "-");
    const key = `${Date.now()}-${safeName}`;
    const response = await fetch(`${this.apiUrl}/shop/media/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        "content-type": file.mimeType || "application/octet-stream",
        "x-media-secret": this.secret,
      },
      body: asArrayBuffer(file.content),
    });
    if (!response.ok) {
      throw new Error(`R2 upload failed (${response.status}).`);
    }
    return { url: `${this.fileUrl}/${key}`, key };
  }

  async delete(file: { fileKey?: string; file_key?: string } | Array<{ fileKey?: string; file_key?: string }>) {
    const items = Array.isArray(file) ? file : [file];
    for (const item of items) {
      const key = item.fileKey || item.file_key;
      if (!key) continue;
      const response = await fetch(`${this.apiUrl}/shop/media/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: { "x-media-secret": this.secret },
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`R2 delete failed (${response.status}).`);
      }
    }
  }

  async getPresignedDownloadUrl(file: { fileKey?: string; file_key?: string }): Promise<string> {
    const key = file.fileKey || file.file_key || "";
    return `${this.fileUrl}/${key}`;
  }
}

export default R2FileProviderService;
