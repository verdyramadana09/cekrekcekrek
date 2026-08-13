require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const stream = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(__dirname));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function uploadBufferToDrive(buffer, fileName, mimeType, parentFolderId) {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const fileMetadata = { name: fileName, parents: [parentFolderId] };
    const media = { mimeType: mimeType, body: bufferStream };

    const uploaded = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink'
    });

    await drive.permissions.create({
        fileId: uploaded.data.id,
        requestBody: { role: 'reader', type: 'anyone' },
    });

    return uploaded.data.webViewLink;
}

app.post('/upload-session', async (req, res) => {
    try {
        const { frameImage, individualImages, gifImage } = req.body;
        const sessionName = `Sesi_${Date.now()}`;
        
        const folder = await drive.files.create({
            resource: { name: sessionName, mimeType: 'application/vnd.google-apps.folder', parents: [GOOGLE_DRIVE_FOLDER_ID] },
            fields: 'id, webViewLink'
        });
        const subFolderId = folder.data.id;

        // 1. Upload Hasil Frame
        if (frameImage) {
            const frameBuffer = Buffer.from(frameImage.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            await uploadBufferToDrive(frameBuffer, 'Hasil_Frame.png', 'image/png', subFolderId);
        }

        // 2. Upload Foto Satuan
        if (individualImages && Array.isArray(individualImages)) {
            for (let i = 0; i < individualImages.length; i++) {
                const singleBuffer = Buffer.from(individualImages[i].replace(/^data:image\/\w+;base64,/, ""), 'base64');
                await uploadBufferToDrive(singleBuffer, `Foto_Satuan_${i + 1}.png`, 'image/png', subFolderId);
            }
        }

        // 3. Upload GIF
        if (gifImage) {
            const gifBuffer = Buffer.from(gifImage.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            await uploadBufferToDrive(gifBuffer, 'Animasi_Live.gif', 'image/gif', subFolderId);
        }

        res.json({ success: true, folder_link: folder.data.webViewLink });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat folder', error: error.message });
    }
});

// Gunakan port dari Railway, atau fallback ke 3000 jika dijalankan secara lokal
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});
