import { Label } from "@/components/ui/label";
import { ImageUploadField } from "@/components/ImageUploadField";
import { encodeDepositQr, readDepositQr } from "@/lib/bot/deposit-controls";

export function DepositQrField({ label, address, value, onChange }: { label: string; address: string; value: string; onChange: (value: string) => void }) {
  const qr = readDepositQr(value);
  return <div className="space-y-2">
    <Label>{label} · Telegram QR</Label>
    <ImageUploadField compact preserveOriginal value={qr?.url ?? ""} placeholder="https://…/payment-qr.png" onChange={url => onChange(encodeDepositQr(url, address))} />
    {qr && <img src={qr.url} alt={`${label} payment QR`} className="h-40 w-40 rounded border border-border object-contain" />}
    {qr && qr.address !== address.trim() && <p className="text-sm text-destructive">Receiving address changed. Upload the matching QR again before saving.</p>}
  </div>;
}