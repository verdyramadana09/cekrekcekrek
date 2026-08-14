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
        fields: 'id, webViewLink, webContentLink'
    });

    await drive.permissions.create({
        fileId: uploaded.data.id,
        requestBody: { role: 'reader', type: 'anyone' },
    });

    // Mengembalikan direct webContentLink atau webViewLink agar bisa diakses langsung sebagai URL gambar
    return uploaded.data.webContentLink || uploaded.data.webViewLink;
}

// Fungsi pembantu untuk mencari atau membuat subfolder "frame" di dalam GOOGLE_DRIVE_FOLDER_ID
async function getOrCreateFrameFolder() {
    try {
        const response = await drive.files.list({
            q: `name = 'frame' and '${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)'
        });

        if (response.data.files && response.data.files.length > 0) {
            return response.data.files[0].id;
        } else {
            const folder = await drive.files.create({
                resource: {
                    name: 'frame',
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [GOOGLE_DRIVE_FOLDER_ID]
                },
                fields: 'id'
            });
            return folder.data.id;
        }
    } catch (error) {
        console.error('Error saat mencari/membuat folder frame:', error);
        throw error;
    }
}

// =====================================================
// ENDPOINT 1: UPLOAD SESSION (TETAP SEPERTI SEMULA / TIDAK DIRUBAH)
// =====================================================
app.post('/upload-frame', async (req, res) => {
    try {
        const { frameName, frameData } = req.body;
        if (!frameData) {
            return res.status(400).json({ success: false, message: 'Data frame tidak ditemukan' });
        }

        const frameFolderId = await getOrCreateFrameFolder();
        if (!frameFolderId) {
            return res.status(500).json({ success: false, message: 'Folder frame di Google Drive gagal diinisialisasi.' });
        }

        const base64Clean = frameData.replace(/^data:image\/\w+;base64,/, "");
        const frameBuffer = Buffer.from(base64Clean, 'base64');
        
        const fileName = frameName || `Custom_Frame_${Date.now()}.png`;
        
        // Unggah buffer ke folder "frame" di Google Drive dan atur izin publik
        const bufferStream = new stream.PassThrough();
        bufferStream.end(frameBuffer);

        const fileMetadata = { name: fileName, parents: [frameFolderId] };
        const media = { mimeType: 'image/png', body: bufferStream };

        const uploaded = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink'
        });

        await drive.permissions.create({
            fileId: uploaded.data.id,
            requestBody: { role: 'reader', type: 'anyone' },
        });

        // Gunakan format direct link file ID Google Drive agar stabil dirender browser
        const directUrl = `https://drive.google.com/uc?export=view&id=${uploaded.data.id}`;

        res.json({ success: true, frame_url: directUrl });
    } catch (error) {
        console.error('Error upload frame:', error);
        res.status(500).json({ success: false, message: 'Gagal mengunggah frame', error: error.message });
    }
});

// =====================================================
// ENDPOINT 2: UPLOAD CUSTOM FRAME KE FOLDER "frame" DI DRIVE
// =====================================================
app.post('/upload-frame', async (req, res) => {
    try {
        const { frameName, frameData } = req.body;
        if (!frameData) {
            return res.status(400).json({ success: false, message: 'Data frame tidak ditemukan' });
        }

        const frameFolderId = await getOrCreateFrameFolder();
        const base64Clean = frameData.replace(/^data:image\/\w+;base64,/, "");
        const frameBuffer = Buffer.from(base64Clean, 'base64');
        
        const fileName = frameName || `Custom_Frame_${Date.now()}.png`;
        const fileUrl = await uploadBufferToDrive(frameBuffer, fileName, 'image/png', frameFolderId);

        // Ubah format URL webContentLink agar dapat dirender langsung sebagai latar belakang gambar web
        const directUrl = `https://drive.google.com/uc?export=view&id=${fileUrl.match(/id=([^&]+)/)?.[1] || ''}`;

        res.json({ success: true, frame_url: directUrl });
    } catch (error) {
        console.error('Error upload frame:', error);
        res.status(500).json({ success: false, message: 'Gagal mengunggah frame', error: error.message });
    }
});

// =====================================================
// ENDPOINT 3: AMBIL DAFTAR FRAME DARI FOLDER "frame" DI DRIVE
// =====================================================
app.get('/get-frames', async (req, res) => {
    try {
        const frameFolderId = await getOrCreateFrameFolder();
        
        const response = await drive.files.list({
            q: `'${frameFolderId}' in parents and trashed = false`,
            fields: 'files(id, name, webContentLink, webViewLink)'
        });

        const frames = response.data.files.map(file => {
            return `https://drive.google.com/uc?export=view&id=${file.id}`;
        });

        res.json({ success: true, frames: frames });
    } catch (error) {
        console.error('Error get frames:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat daftar frame', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});
