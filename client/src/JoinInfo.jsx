import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export const joinUrl = (code) => `${window.location.origin}/?join=${code}`;
export const tvUrl = (code) => `${window.location.origin}/tv/${code}`;

export function QR({ text, size = 180 }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#241811', light: '#F6EFE2' } })
      .then(setSvg).catch(() => setSvg(''));
  }, [text]);
  return <div className="qr" style={{ width: size, height: size }} role="img" aria-label="QR code to join this table" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function JoinInfo({ code, showTv = true }) {
  const [copied, setCopied] = useState(false);
  const url = joinUrl(code);
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: 'Join my Hold’em table', url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    } catch { /* cancelled */ }
  }
  return (
    <div className="join-info">
      <QR text={url} />
      <div className="join-text">
        <span className="field-label">Table code</span>
        <span className="join-code" aria-label={code.split('').join(' ')}>{code}</span>
        <p className="muted small">Scan the code, or open this site and enter the code.</p>
        <div className="row wrap">
          <button className="btn ghost small" onClick={share}>{copied ? 'Link copied' : 'Share link'}</button>
          {showTv && <a className="btn ghost small" href={tvUrl(code)} target="_blank" rel="noreferrer">Open TV view</a>}
        </div>
      </div>
    </div>
  );
}
