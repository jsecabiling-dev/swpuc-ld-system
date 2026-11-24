const MAX_OUTPUT_BYTES = 50 * 1024;
const MAX_DIMENSION = 512;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the selected profile picture.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not resize the selected profile picture.'));
    }, 'image/jpeg', quality);
  });
}

export async function processProfilePicture(file, {
  maxBytes = MAX_OUTPUT_BYTES,
  maxDimension = MAX_DIMENSION,
  qualities = [0.82, 0.68, 0.54, 0.4],
} = {}) {
  const image = await loadImage(file);
  let scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));

  for (let dimensionAttempt = 0; dimensionAttempt < 5; dimensionAttempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not resize the selected profile picture.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= maxBytes) {
        return new File([blob], 'profile-picture.jpg', { type: 'image/jpeg', lastModified: Date.now() });
      }
    }
    scale *= 0.75;
  }

  throw new Error(`Could not reduce the profile picture below ${maxBytes / 1024} KB. Choose a smaller image.`);
}
