import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 10;

// A floating card anchored to the (i) button. It sits over the page instead of pushing it down.
function Popover({ anchor, id, title, onClose, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = ref.current;
    if (!a || !el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(360, vw - MARGIN * 2);
    const h = el.offsetHeight;
    let left = a.left + a.width / 2 - w / 2;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
    const below = vh - a.bottom - MARGIN;
    const above = a.top - MARGIN;
    const flip = h > below && above > below;
    const room = flip ? above : below;
    const top = flip ? Math.max(MARGIN, a.top - 10 - Math.min(h, room)) : a.bottom + 10;
    setPos({ left, top, width: w, maxHeight: Math.max(160, room - 10), arrow: Math.max(18, Math.min(w - 18, a.left + a.width / 2 - left)), flip });
  }, [anchor]);

  useLayoutEffect(place, [place, children]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchor.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, onClose, place]);

  return createPortal(
    <div ref={ref} id={id} role="dialog" aria-label={title}
      className={`info-pop ${pos?.flip ? 'flip' : ''}`}
      style={pos ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight, '--arrow': `${pos.arrow}px` } : { visibility: 'hidden', width: 360, maxWidth: 'calc(100vw - 20px)' }}>
      <div className="info-pop-head">
        <strong>{title}</strong>
        <button type="button" className="info-close" aria-label="Close help" onClick={onClose}>✕</button>
      </div>
      <div className="info-pop-body">{children}</div>
    </div>,
    document.body,
  );
}

// Label row with an optional (i) button that opens a floating explanation.
export function FieldHead({ label, info, htmlFor, as: Tag = 'span', className = '' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className={`field-head ${className}`}>
      {htmlFor
        ? <label className="field-label" htmlFor={htmlFor}>{label}</label>
        : <Tag className="field-label">{label}</Tag>}
      {info && (
        <button ref={btn} type="button" className="info-btn" aria-expanded={open} aria-controls={open ? id : undefined}
          aria-label={`Help: ${label}`} onClick={() => setOpen((o) => !o)}>
          <span aria-hidden="true">i</span>
        </button>
      )}
      {info && open && <Popover anchor={btn} id={id} title={label} onClose={close}>{info}</Popover>}
    </div>
  );
}

// Option explainer: <Options><Opt name="Blinds">…</Opt></Options>
export function Options({ children }) {
  return <dl className="info-options">{children}</dl>;
}
export function Opt({ name, children }) {
  return <><dt>{name}</dt><dd>{children}</dd></>;
}
