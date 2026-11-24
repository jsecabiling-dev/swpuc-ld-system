import React, { useRef, useState } from 'react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function ProfilePhotoCrop({ photo, onApply, onCancel, busy }) {
  const image = useRef(null);
  const drag = useRef(null);
  const [crop, setCrop] = useState(null);

  const initialize = (event) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
    const size = Math.min(width, height) * 0.8;
    setCrop({ x: (width - size) / 2, y: (height - size) / 2, size });
  };

  const startDrag = (event, edge) => {
    if (busy || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { crop, edge, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const moveDrag = (event) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const { naturalWidth: width, naturalHeight: height } = image.current;
    const scale = width / image.current.getBoundingClientRect().width;
    const dx = (event.clientX - start.x) * scale;
    const dy = (event.clientY - start.y) * scale;
    const { x, y, size } = start.crop;
    const minSize = Math.min(width, height) * 0.2;

    if (start.edge === 'move') {
      setCrop({ x: clamp(x + dx, 0, width - size), y: clamp(y + dy, 0, height - size), size });
      return;
    }

    if (start.edge === 'left' || start.edge === 'right') {
      const left = start.edge === 'left';
      const next = clamp(size + (left ? -dx : dx), minSize, Math.min(height, left ? x + size : width - x));
      setCrop({ x: left ? x + size - next : x, y: clamp(y + (size - next) / 2, 0, height - next), size: next });
      return;
    }

    const top = start.edge === 'top';
    const next = clamp(size + (top ? -dy : dy), minSize, Math.min(width, top ? y + size : height - y));
    setCrop({ x: clamp(x + (size - next) / 2, 0, width - next), y: top ? y + size - next : y, size: next });
  };

  const apply = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.max(1, Math.round(crop.size));
    canvas.getContext('2d').drawImage(image.current, crop.x, crop.y, crop.size, crop.size, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => { if (blob) onApply(blob); }, 'image/png');
  };

  const width = image.current?.naturalWidth;
  const height = image.current?.naturalHeight;

  return (
    <section aria-label="Crop photo" className="mb-3">
      <p className="small mb-2">Drag the frame to move it. Drag a side to resize it.</p>
      <div className="position-relative d-inline-block overflow-hidden rounded align-top mb-3">
        <img ref={image} src={photo} alt="Photo to crop" onLoad={initialize} draggable={false} className="img-fluid d-block" style={{ maxHeight: 'var(--profile-photo-crop-max-height, 52dvh)' }} />
        {crop && (
          <div
            className="position-absolute border border-2 border-white"
            style={{ left: `${crop.x / width * 100}%`, top: `${crop.y / height * 100}%`, width: `${crop.size / width * 100}%`, height: `${crop.size / height * 100}%`, boxShadow: '0 0 0 100vmax #0008', touchAction: 'none', cursor: 'move' }}
            onPointerDown={(event) => startDrag(event, 'move')}
            onPointerMove={moveDrag}
            onLostPointerCapture={() => { drag.current = null; }}
          >
            {['top', 'right', 'bottom', 'left'].map((edge) => {
              const vertical = edge === 'left' || edge === 'right';
              return (
                <div key={edge} aria-hidden="true" className="position-absolute d-flex align-items-center justify-content-center"
                  style={{ [edge]: -12, [vertical ? 'top' : 'left']: 0, width: vertical ? 24 : '100%', height: vertical ? '100%' : 24, cursor: vertical ? 'ew-resize' : 'ns-resize' }}
                  onPointerDown={(event) => { event.stopPropagation(); startDrag(event, edge); }}>
                  <span className="bg-white rounded-pill" style={{ width: vertical ? 5 : 24, height: vertical ? 24 : 5 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="d-flex gap-2 profile-photo-crop-actions">
        <button type="button" className="btn btn-success" disabled={!crop || busy} onClick={apply}>Use crop</button>
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>Cancel crop</button>
      </div>
    </section>
  );
}
