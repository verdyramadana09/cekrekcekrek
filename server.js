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

oauth2Client.setCredentials({
    refresh_token: REFRESH_TOKEN
});

const drive = google.drive({
    version: 'v3',
    auth: oauth2Client
});

async function uploadBufferToDrive(
    buffer,
    fileName,
    mimeType,
    parentFolderId
) {
    const bufferStream = new stream.PassThrough();

    bufferStream.end(buffer);

    const fileMetadata = {
        name: fileName,
        parents: [parentFolderId]
    };

    const media = {
        mimeType: mimeType,
        body: bufferStream
    };

    const uploaded = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink, webContentLink'
    });

    await drive.permissions.create({
        fileId: uploaded.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone'
        }
    });

    return uploaded.data.webContentLink ||
        uploaded.data.webViewLink;
}


// =====================================================
// Fungsi pembantu untuk mencari atau membuat subfolder
// "frame" di dalam GOOGLE_DRIVE_FOLDER_ID
// =====================================================

async function getOrCreateFrameFolder() {
    try {
        const response = await drive.files.list({
            q: `name = 'frame' and '${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)'
        });

        if (
            response.data.files &&
            response.data.files.length > 0
        ) {
            return response.data.files[0].id;

        } else {

            const folder = await drive.files.create({
                resource: {
                    name: 'frame',
                    mimeType:
                        'application/vnd.google-apps.folder',
                    parents: [
                        GOOGLE_DRIVE_FOLDER_ID
                    ]
                },
                fields: 'id'
            });

            return folder.data.id;
        }

    } catch (error) {

        console.error(
            'Error saat mencari/membuat folder frame:',
            error
        );

        throw error;
    }
}


// =====================================================
// TAMBAHAN STICKER
// Fungsi mencari / membuat folder "sticker"
// =====================================================

async function getOrCreateStickerFolder() {
    try {

        const response = await drive.files.list({
            q: `name = 'sticker' and '${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)'
        });

        if (
            response.data.files &&
            response.data.files.length > 0
        ) {

            return response.data.files[0].id;

        } else {

            const folder = await drive.files.create({
                resource: {
                    name: 'sticker',
                    mimeType:
                        'application/vnd.google-apps.folder',
                    parents: [
                        GOOGLE_DRIVE_FOLDER_ID
                    ]
                },
                fields: 'id'
            });

            return folder.data.id;
        }

    } catch (error) {

        console.error(
            'Error saat mencari/membuat folder sticker:',
            error
        );

        throw error;
    }
}


// =====================================================
// ENDPOINT 1: UPLOAD SESSION
// TETAP SEPERTI SCRIPT ASLI
// =====================================================

app.post('/upload-session', async (req, res) => {
    try {

        const {
            frameImage,
            individualImages,
            gifImage
        } = req.body;

        const sessionName =
            `Sesi_${Date.now()}`;

        const folder =
            await drive.files.create({
                resource: {
                    name: sessionName,
                    mimeType:
                        'application/vnd.google-apps.folder',
                    parents: [
                        GOOGLE_DRIVE_FOLDER_ID
                    ]
                },
                fields: 'id, webViewLink'
            });

        const subFolderId =
            folder.data.id;


        // 1. Upload Hasil Frame

        if (frameImage) {

            const frameBuffer =
                Buffer.from(
                    frameImage.replace(
                        /^data:image\/\w+;base64,/,
                        ""
                    ),
                    'base64'
                );

            await uploadBufferToDrive(
                frameBuffer,
                'Hasil_Frame.png',
                'image/png',
                subFolderId
            );
        }


        // 2. Upload Foto Satuan

        if (
            individualImages &&
            Array.isArray(individualImages)
        ) {

            for (
                let i = 0;
                i < individualImages.length;
                i++
            ) {

                const singleBuffer =
                    Buffer.from(
                        individualImages[i].replace(
                            /^data:image\/\w+;base64,/,
                            ""
                        ),
                        'base64'
                    );

                await uploadBufferToDrive(
                    singleBuffer,
                    `Foto_Satuan_${i + 1}.png`,
                    'image/png',
                    subFolderId
                );
            }
        }


        // 3. Upload GIF

        if (gifImage) {

            const gifBuffer =
                Buffer.from(
                    gifImage.replace(
                        /^data:image\/\w+;base64,/,
                        ""
                    ),
                    'base64'
                );

            await uploadBufferToDrive(
                gifBuffer,
                'Animasi_Live.gif',
                'image/gif',
                subFolderId
            );
        }


        res.json({
            success: true,
            folder_link:
                folder.data.webViewLink
        });

    } catch (error) {

        console.error(
            'Error:',
            error
        );

        res.status(500).json({
            success: false,
            message:
                'Gagal membuat folder',
            error:
                error.message
        });
    }
});


// =====================================================
// ENDPOINT 2: UPLOAD CUSTOM FRAME
// TETAP SEPERTI SCRIPT ASLI
// =====================================================

app.post('/upload-frame', async (req, res) => {

    try {

        const {
            frameName,
            frameData
        } = req.body;

        if (!frameData) {

            return res.status(400).json({
                success: false,
                message:
                    'Data frame tidak ditemukan'
            });
        }


        const frameFolderId =
            await getOrCreateFrameFolder();


        const base64Clean =
            frameData.replace(
                /^data:image\/\w+;base64,/,
                ""
            );


        const frameBuffer =
            Buffer.from(
                base64Clean,
                'base64'
            );


        const fileName =
            frameName ||
            `Custom_Frame_${Date.now()}.png`;


        const fileUrl =
            await uploadBufferToDrive(
                frameBuffer,
                fileName,
                'image/png',
                frameFolderId
            );


        const directUrl =
            `https://drive.google.com/uc?export=view&id=${
                fileUrl.match(/id=([^&]+)/)?.[1] || ''
            }`;


        res.json({
            success: true,
            frame_url:
                directUrl
        });

    } catch (error) {

        console.error(
            'Error upload frame:',
            error
        );

        res.status(500).json({
            success: false,
            message:
                'Gagal mengunggah frame',
            error:
                error.message
        });
    }
});


// =====================================================
// ENDPOINT 3: AMBIL DAFTAR FRAME
// TETAP SEPERTI SCRIPT ASLI
// =====================================================

app.get('/get-frames', async (req, res) => {

    try {

        const frameFolderId =
            await getOrCreateFrameFolder();


        const response =
            await drive.files.list({
                q:
                    `'${frameFolderId}' in parents and trashed = false`,
                fields:
                    'files(id, name, webContentLink, webViewLink)'
            });


        const frames =
            response.data.files.map(file => {

                return `https://drive.google.com/uc?export=view&id=${file.id}`;

            });


        res.json({
            success: true,
            frames:
                frames
        });

    } catch (error) {

        console.error(
            'Error get frames:',
            error
        );

        res.status(500).json({
            success: false,
            message:
                'Gagal memuat daftar frame',
            error:
                error.message
        });
    }
});


// =====================================================
// TAMBAHAN STICKER
// ENDPOINT UPLOAD STICKER PNG
// KHUSUS NAMA "CEKREK"
// =====================================================

app.post('/upload-sticker', async (req, res) => {

    try {

        const {
            adminName,
            stickerName,
            stickerData
        } = req.body;


        // Hanya cekrek yang boleh upload

        if (
            String(adminName || '')
                .trim()
                .toLowerCase() !== 'cekrek'
        ) {

            return res.status(403).json({
                success: false,
                message:
                    'Anda tidak memiliki akses upload sticker.'
            });
        }


        if (!stickerData) {

            return res.status(400).json({
                success: false,
                message:
                    'Data sticker tidak ditemukan'
            });
        }


        // Cari / buat folder sticker

        const stickerFolderId =
            await getOrCreateStickerFolder();


        // Bersihkan Base64

        const base64Clean =
            stickerData.replace(
                /^data:image\/\w+;base64,/,
                ""
            );


        // Ubah ke Buffer

        const stickerBuffer =
            Buffer.from(
                base64Clean,
                'base64'
            );


        // Nama file

        let fileName =
            stickerName ||
            `Sticker_${Date.now()}.png`;


        // Pastikan PNG

        if (
            !fileName
                .toLowerCase()
                .endsWith('.png')
        ) {

            fileName += '.png';
        }


        // Upload ke Google Drive

        const fileUrl =
            await uploadBufferToDrive(
                stickerBuffer,
                fileName,
                'image/png',
                stickerFolderId
            );


        // Ambil ID file

        const fileId =
            fileUrl.match(
                /id=([^&]+)/
            )?.[1] || '';


        // URL yang bisa langsung dipakai
        // sebagai gambar

        const directUrl =
            `https://drive.google.com/uc?export=view&id=${fileId}`;


        res.json({
            success: true,
            sticker_url:
                directUrl
        });


    } catch (error) {

        console.error(
            'Error upload sticker:',
            error
        );

        res.status(500).json({
            success: false,
            message:
                'Gagal mengunggah sticker',
            error:
                error.message
        });
    }
});


// =====================================================
// TAMBAHAN STICKER
// ENDPOINT AMBIL SEMUA STICKER
// BISA DIAKSES SEMUA USER
// =====================================================

app.get('/get-stickers', async (req, res) => {

    try {

        // Cari / buat folder sticker

        const stickerFolderId =
            await getOrCreateStickerFolder();


        // Ambil semua file

        const response =
            await drive.files.list({

                q:
                    `'${stickerFolderId}' in parents and trashed = false`,

                fields:
                    'files(id, name, webContentLink, webViewLink)',

                orderBy:
                    'createdTime'
            });


        // Ubah menjadi URL gambar

        const stickers =
            response.data.files.map(
                file => {

                    return {
                        id:
                            file.id,

                        name:
                            file.name,

                        url:
                            `https://drive.google.com/uc?export=view&id=${file.id}`
                    };

                }
            );


        res.json({
            success: true,
            stickers:
                stickers
        });


    } catch (error) {

        console.error(
            'Error get stickers:',
            error
        );

        res.status(500).json({
            success: false,
            message:
                'Gagal memuat daftar sticker',
            error:
                error.message
        });
    }
});


// =====================================================
// SERVER
// =====================================================

app.listen(PORT, () => {

    console.log(
        `Server berjalan di port ${PORT}`
    );

});
