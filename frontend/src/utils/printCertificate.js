import QRCode from 'qrcode';
import { formatShortDate } from './dateFormat';
import { certificateVerificationUrl, formatCertificateLevel } from './certificateVerification';
import sdaLogoGreen from '../pages/thumbnails/sda_logo_green.png';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export async function printCertificate(record, recipientName, onPopupBlocked = () => {}) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    onPopupBlocked();
    return;
  }

  let qrImage = '';
  if (record.certificate_verification_code) {
    try {
      const url = certificateVerificationUrl(record.certificate_verification_code);
      const image = await QRCode.toDataURL(url, { width: 320 });
      qrImage = `<div class="qr"><a href="${escapeHtml(url)}"><img alt="Verify certificate online" src="${image}"></a></div>`;
    } catch {
      printWindow.document.body.textContent = 'Could not generate the certificate verification QR code.';
      return;
    }
  }
  const courseTitle = record.event_name || record.course_title || 'Learning event';
  const courseLevel = formatCertificateLevel(record.learning_level || record.course_level);
  const programTitle = courseLevel && !courseTitle.toLowerCase().includes(courseLevel.toLowerCase())
    ? `${courseTitle} ${courseLevel}`
    : courseTitle;
  const eventPeriod = record.start_date
    ? `${formatShortDate(record.start_date)}${record.end_date && record.end_date !== record.start_date ? ` – ${formatShortDate(record.end_date)}` : ''}`
    : '';

  const pageStyles = `
    @page { size: A4 portrait; margin: 12mm; }
    html { background: #e9ecef; }
    body {
      box-sizing: border-box;
      width: 210mm;
      min-height: 297mm;
      margin: 24px auto;
      padding: 12mm;
      background: white;
      box-shadow: 0 2px 12px #0002;
    }
    .certificate { width: 186mm; min-height: 273mm; }
    .certificate > * { flex-shrink: 0; overflow-wrap: anywhere; }
    @media print {
      html { background: white; }
      body {
        width: auto;
        min-height: 0;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
    }
  `;

  printWindow.document.write(`<!doctype html><html><head><title>Certificate - ${escapeHtml(record.certificate_number)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Mrs+Saint+Delafield&family=PT+Sans+Narrow&display=swap" rel="stylesheet"><style>@page{size:A4;margin:12mm}body{font-family:Georgia,serif;color:rgb(0,0,0);margin:0;padding:0}.certificate{box-sizing:border-box;border:2px solid rgb(0,0,0);min-height:273mm;padding:40px 56px;text-align:center;display:flex;flex-direction:column;justify-content:space-between}.church-heading{margin:0 0 28px}.church-heading img{display:block;width:93px;height:93px;object-fit:contain;margin:0 auto 8px}.church-heading h2{font-family:'PT Sans Narrow',sans-serif;font-size:22px;font-weight:normal;letter-spacing:.04em;margin:0}.church-heading h3{font-family:'DM Serif Display',serif;font-size:27px;font-weight:normal;margin:3px 0 0}.church-heading address{font-family:'PT Sans Narrow',sans-serif;font-size:16px;font-style:normal;margin:2px 0 0}.eyebrow{font-family:'Mrs Saint Delafield',cursive;font-size:68px;letter-spacing:normal;color:rgb(0,0,0);margin:0 0 12px}.award-line{font-family:'PT Sans Narrow',sans-serif;font-size:18px;font-weight:normal;margin:0}.recognition-line{font-family:'PT Sans Narrow',sans-serif;font-size:18px;margin:8px 0 0}.name{font-family:'DM Serif Display',serif;font-size:42px;margin:16px}.course{font-family:'DM Serif Display',serif;font-size:28px;margin:12px}.event-detail{font-family:'PT Sans Narrow',sans-serif;font-size:16px;margin:2px 0}.closing-line{font-family:'PT Sans Narrow',sans-serif;font-size:18px;margin:4px 0 0}.meta{font-family:'PT Sans Narrow',sans-serif;font-size:13px;margin-top:0;color:rgb(0,0,0)}.qr{display:flex;justify-content:center;margin:18px 0 4px}.qr img{width:110px;height:110px}.notice{border:0.5px solid #999;padding:6px 10px;margin:0;font-family:'PT Sans Narrow',sans-serif;font-size:10px;text-align:center}.notice strong{display:block;text-align:center;margin-bottom:3px}${pageStyles}</style></head><body><main class="certificate"><header class="church-heading"><img src="${sdaLogoGreen}" alt="Seventh-day Adventist logo"><h2>Seventh-day Adventist Church</h2><h3>Southwestern Philippine Union Conference</h3><address>Materson Avenue, Upper Carmen, Cagayan de Oro City, Philippines</address></header><p class="eyebrow">Certificate of Completion</p><h1 class="award-line">This certificate is proudly presented to</h1><div class="name">${escapeHtml(recipientName)}</div><p class="recognition-line">in recognition of the successful completion of</p><div class="course">${escapeHtml(programTitle)}</div>${record.offering_institution ? `<p class="event-detail">Facilitated by ${escapeHtml(record.offering_institution)}</p>` : ''}${eventPeriod ? `<p class="event-detail">Conducted on ${escapeHtml(eventPeriod)}</p>` : ''}<p class="closing-line">This futher certifies that the recipient has completed the required learning hours and fulfilled all prescribed requirements of the program.</p>${qrImage}<div class="meta">Issued on ${escapeHtml(record.certification_date ? formatShortDate(record.certification_date) : '')}<br>Certificate No. ${escapeHtml(record.certificate_number || '')}</div><footer class="notice"><strong>IMPORTANT NOTICE</strong>This is a system-generated document and does not require handwritten signatures. To verify its authenticity and validity, scan the QR code provided or visit the official online verification page.</footer></main><script>window.onload=async()=>{await document.fonts.ready;window.print()}</script></body></html>`);
  printWindow.document.close();
}
