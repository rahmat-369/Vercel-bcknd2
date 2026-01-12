const Busboy = require('busboy');
const AdmZip = require('adm-zip');

export const config = {
  api: {
    bodyParser: false,
  },
};

const VERCEL_TOKEN = "l16kX4TZ6ykuOIbdhZbr7sHp";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const busboy = Busboy({ headers: req.headers });
  let projectName = '';
  let fileBuffer = Buffer.alloc(0);
  let fileName = '';
  let contentType = '';

  busboy.on('field', (name, val) => {
    if (name === 'name') projectName = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
  });

  busboy.on('file', (name, file, info) => {
    fileName = info.filename;
    contentType = info.mimeType;
    file.on('data', (data) => {
      fileBuffer = Buffer.concat([fileBuffer, data]);
    });
  });

  busboy.on('finish', async () => {
    try {
      if (!projectName) throw new Error("Nama project wajib diisi!");

      let filesToDeploy = [];

      if (contentType === 'application/zip' || fileName.endsWith('.zip')) {
        const zip = new AdmZip(fileBuffer);
        const zipEntries = zip.getEntries();
        zipEntries.forEach(entry => {
          if (!entry.isDirectory && !entry.entryName.includes('__MACOSX')) {
            filesToDeploy.push({
              file: entry.entryName,
              data: entry.getData().toString('base64'),
              encoding: 'base64'
            });
          }
        });
      } else {
        let rawContent = fileBuffer.toString('utf-8');
        
        if (rawContent.includes('eval(function') && !rawContent.includes('<html')) {
          rawContent = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><script>${rawContent}</script></body></html>`;
        }

        filesToDeploy.push({
          file: 'index.html',
          data: Buffer.from(rawContent).toString('base64'),
          encoding: 'base64'
        });
      }

      const response = await fetch('https://api.vercel.com/v13/deployments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: projectName,
          target: 'production', 
          files: filesToDeploy,
          projectSettings: { framework: null }
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error?.message || "Gagal deploy");

      return res.status(200).json({
        success: true,
        url: `${projectName}.vercel.app`
      });

    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  req.pipe(busboy);
    }
