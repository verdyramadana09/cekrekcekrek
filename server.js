const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const stream = require('stream');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(__dirname));

// =================================================================
const CLIENT_ID = '237285581279-6m365ag9d2s9vkl9ekjlammbq142a0ve.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04ve8Q6GFSFLfCgYIARAAGAQSNwF-L9IrIMl8smxjalpBR28qxuY_c7bvwD76QmK8HvR-f8w_g0vEY8QNYeygjwAVZPhev8yy_-Y';
const GOOGLE_DRIVE_FOLDER_ID = '18K5ge-B_8dgtx2a6HWk0kI1dx6_6n29v';
// =================================================================

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

// Endpoint untuk Sesi Otomatis (Folder + Frame + Satuan + GIF)
app.post('/upload-session', async (req, res) => {
    try {
        const { frameImage, individualImages, gifImage } = req.body;
        const sessionName = `Sesi_${Date.now()}`;
        console.log(`Membuat folder sesi: ${sessionName}`);

        // Menggunakan GOOGLE_DRIVE_FOLDER_ID yang konsisten
        const folder = await drive.files.create({
            resource: { name: sessionName, mimeType: 'application/vnd.google-apps.folder', parents: [GOOGLE_DRIVE_FOLDER_ID] },
            fields: 'id, webViewLink'
        });
        const subFolderId = folder.data.id;

        // 1. Upload Hasil Frame
        const frameBuffer = Buffer.from(frameImage.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        await uploadBufferToDrive(frameBuffer, 'Hasil_Frame.png', 'image/png', subFolderId);

        // 2. Upload Foto Satuan Terpisah
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

        console.log('Semua file sesi berhasil diunggah!');
        res.json({ success: true, folder_link: folder.data.webViewLink });

    } catch (error) {
        console.error('Error Session Upload:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat folder', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server Backend berjalan di http://localhost:${PORT}`);
});