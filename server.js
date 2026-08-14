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

// Nama admin yang boleh upload frame dan sticker
const ADMIN_NAME = (
    process.env.ADMIN_NAME || 'cekrek'
).trim().toLowerCase();

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
    refresh_token: REFRESH_TOKEN
});

const drive = google.drive({
    version: 'v3',
    auth: oauth2Client
});

// =====================================================
// CEK ADMIN
// =====================================================

function isAdmin(name) {
    return String(name || '')
        .trim()
        .toLowerCase() === ADMIN_NAME;
}

// =====================================================
// MEMBERSIHKAN BASE64
// =====================================================

function cleanBase64(data) {
    return String(data || '').replace(
        /^data:[^;]+;base64,/,
        ''
    );
}

// =====================================================
// URL GOOGLE DRIVE
// =====================================================

function getDirectDriveUrl(fileId) {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

// =====================================================
// UPLOAD BUFFER KE GOOGLE DRIVE
// =====================================================

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
        fields: 'id,name,webViewLink,webContentLink'
    });

    // Membuat file bisa dibaca oleh siapa saja
    await drive.permissions.create({
        fileId: uploaded.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone'
        }
    });

    return {
        id: uploaded.data.id,
        name: uploaded.data.name,
        webViewLink:
            uploaded.data.webViewLink ||
            `https://drive.google.com/file/d/${uploaded.data.id}/view`,
        webContentLink:
            uploaded.data.webContentLink || null,
        directUrl:
            getDirectDriveUrl(uploaded.data.id)
    };
}

// =====================================================
// GET / CREATE FOLDER
// =====================================================

async function getOrCreateFolder(folderName) {
    try {
        const escapedName = folderName.replace(
            /'/g,
            "\\'"
        );

        const response = await drive.files.list({
            q:
                `name = '${escapedName}' ` +
                `and '${GOOGLE_DRIVE_FOLDER_ID}' in parents ` +
                `and mimeType = 'application/vnd.google-apps.folder' ` +
                `and trashed = false`,
            fields: 'files(id,name)'
        });

        if (
            response.data.files &&
            response.data.files.length > 0
        ) {
            return response.data.files[0].id;
        }

        const folder = await drive.files.create({
            resource: {
                name: folderName,
                mimeType:
                    'application/vnd.google-apps.folder',
                parents: [
                    GOOGLE_DRIVE_FOLDER_ID
                ]
            },
            fields: 'id,name'
        });

        return folder.data.id;

    } catch (error) {
        console.error(
            `Error membuat folder ${folderName}:`,
            error
        );

        throw error;
    }
}

// =====================================================
// FOLDER FRAME
// =====================================================

async function getOrCreateFrameFolder() {
    return await getOrCreateFolder('frame');
}

// =====================================================
// FOLDER STICKER
// =====================================================

async function getOrCreateStickerFolder() {
    return await getOrCreateFolder('sticker');
}

// =====================================================
// ENDPOINT 1
// UPLOAD SESSION
// =====================================================

app.post('/upload-session', async (req, res) => {
    try {

        const {
            frameImage,
            individualImages,
            gifImage,
            sessionName,
            date
        } = req.body;

        const rawName =
            sessionName ||
            `Sesi_${Date.now()}`;

        const safeName =
            String(rawName)
                .trim()
                .replace(
                    /[<>:"/\\|?*]+/g,
                    ''
                )
                .replace(
                    /\s+/g,
                    '_'
                )
                .substring(
                    0,
                    80
                ) ||
            `Sesi_${Date.now()}`;

        const sessionFolderName =
            `${safeName}_${date || Date.now()}`;

        // Buat folder sesi
        const folder =
            await drive.files.create({
                resource: {
                    name: sessionFolderName,
                    mimeType:
                        'application/vnd.google-apps.folder',
                    parents: [
                        GOOGLE_DRIVE_FOLDER_ID
                    ]
                },
                fields: 'id,webViewLink'
            });

        const subFolderId =
            folder.data.id;

        // =================================================
        // 1. UPLOAD HASIL FRAME
        // =================================================

        if (frameImage) {

            const frameBuffer =
                Buffer.from(
                    cleanBase64(frameImage),
                    'base64'
                );

            await uploadBufferToDrive(
                frameBuffer,
                'Hasil_Frame.png',
                'image/png',
                subFolderId
            );
        }

        // =================================================
        // 2. UPLOAD FOTO SATUAN
        // =================================================

        if (
            individualImages &&
            Array.isArray(individualImages)
        ) {

            for (
                let i = 0;
                i < individualImages.length;
                i++
            ) {

                if (!individualImages[i]) {
                    continue;
                }

                const singleBuffer =
                    Buffer.from(
                        cleanBase64(
                            individualImages[i]
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

        // =================================================
        // 3. UPLOAD GIF
        // =================================================

        if (gifImage) {

            const gifBuffer =
                Buffer.from(
                    cleanBase64(gifImage),
                    'base64'
                );

            await uploadBufferToDrive(
                gifBuffer,
                'Animasi_Live.gif',
                'image/gif',
                subFolderId
            );
        }

        // =================================================
        // RESPONSE
        // =================================================

        res.json({
            success: true,
            folder_link:
                folder.data.webViewLink ||
                `https://drive.google.com/drive/folders/${subFolderId}`
        });

    } catch (error) {

        console.error(
            'Error upload session:',
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
// ENDPOINT 2
// UPLOAD FRAME
// KHUSUS ADMIN CEKREK
// =====================================================

app.post('/upload-frame', async (req, res) => {

    try {

        const {
            adminName,
            frameName,
            frameData
        } = req.body;

        // =================================================
        // CEK ADMIN
        // =================================================

        if (!isAdmin(adminName)) {

            return res.status(403).json({
                success: false,
                message:
                    'Anda tidak memiliki akses upload frame.'
            });
        }

        // =================================================
        // CEK DATA
        // =================================================

        if (!frameData) {

            return res.status(400).json({
                success: false,
                message:
                    'Data frame tidak ditemukan.'
            });
        }

        // =================================================
        // FOLDER FRAME
        // =================================================

        const frameFolderId =
            await getOrCreateFrameFolder();

        // =================================================
        // NAMA FILE
        // =================================================

        const fileName =
            frameName ||
            `Custom_Frame_${Date.now()}.png`;

        // =================================================
        // BUFFER
        // =================================================

        const frameBuffer =
            Buffer.from(
                cleanBase64(frameData),
                'base64'
            );

        // =================================================
        // UPLOAD
        // =================================================

        const uploaded =
            await uploadBufferToDrive(
                frameBuffer,
                fileName,
                'image/png',
                frameFolderId
            );

        // =================================================
        // RESPONSE
        // =================================================

        res.json({
            success: true,
            frame_url:
                uploaded.directUrl,
            id:
                uploaded.id,
            name:
                uploaded.name
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
// ENDPOINT 3
// GET SEMUA FRAME
// PUBLIC
// =====================================================

app.get('/get-frames', async (req, res) => {

    try {

        const frameFolderId =
            await getOrCreateFrameFolder();

        const response =
            await drive.files.list({
                q:
                    `'${frameFolderId}' in parents ` +
                    `and trashed = false ` +
                    `and mimeType != 'application/vnd.google-apps.folder'`,

                fields:
                    'files(id,name)',

                orderBy:
                    'createdTime'
            });

        const frames =
            response.data.files.map(
                file => ({
                    id:
                        file.id,

                    name:
                        file.name,

                    url:
                        getDirectDriveUrl(
                            file.id
                        )
                })
            );

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
// ENDPOINT 4
// UPLOAD STIKER PNG
// KHUSUS ADMIN CEKREK
// =====================================================

app.post('/upload-sticker', async (req, res) => {

    try {

        const {
            adminName,
            stickerName,
            stickerData
        } = req.body;

        // =================================================
        // CEK ADMIN
        // =================================================

        if (!isAdmin(adminName)) {

            return res.status(403).json({
                success: false,
                message:
                    'Anda tidak memiliki akses upload sticker.'
            });
        }

        // =================================================
        // CEK DATA
        // =================================================

        if (!stickerData) {

            return res.status(400).json({
                success: false,
                message:
                    'Data sticker tidak ditemukan.'
            });
        }

        // =================================================
        // FOLDER STICKER
        // =================================================

        const stickerFolderId =
            await getOrCreateStickerFolder();

        // =================================================
        // NAMA FILE
        // =================================================

        let fileName =
            stickerName ||
            `Sticker_${Date.now()}.png`;

        // Pastikan ekstensi PNG
        if (
            !fileName
                .toLowerCase()
                .endsWith('.png')
        ) {
            fileName += '.png';
        }

        // =================================================
        // BUFFER
        // =================================================

        const stickerBuffer =
            Buffer.from(
                cleanBase64(
                    stickerData
                ),
                'base64'
            );

        // =================================================
        // UPLOAD KE GOOGLE DRIVE
        // =================================================

        const uploaded =
            await uploadBufferToDrive(
                stickerBuffer,
                fileName,
                'image/png',
                stickerFolderId
            );

        // =================================================
        // RESPONSE
        // =================================================

        res.json({
            success: true,

            sticker_url:
                uploaded.directUrl,

            id:
                uploaded.id,

            name:
                uploaded.name
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
// ENDPOINT 5
// GET SEMUA STIKER
// PUBLIC
// =====================================================

app.get('/get-stickers', async (req, res) => {

    try {

        const stickerFolderId =
            await getOrCreateStickerFolder();

        const response =
            await drive.files.list({
                q:
                    `'${stickerFolderId}' in parents ` +
                    `and trashed = false ` +
                    `and mimeType != 'application/vnd.google-apps.folder'`,

                fields:
                    'files(id,name)',

                orderBy:
                    'createdTime'
            });

        const stickers =
            response.data.files.map(
                file => ({
                    id:
                        file.id,

                    name:
                        file.name,

                    url:
                        getDirectDriveUrl(
                            file.id
                        )
                })
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
// ROOT
// =====================================================

app.get('/health', (req, res) => {

    res.json({
        success: true,
        message:
            'Server berjalan',
        admin:
            ADMIN_NAME
    });
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
    (err, req, res, next) => {

        console.error(
            'Unhandled error:',
            err
        );

        res.status(500).json({
            success: false,
            message:
                'Terjadi kesalahan pada server.',
            error:
                err.message
        });
    }
);

// =====================================================
// START SERVER
// =====================================================

app.listen(
    PORT,
    () => {

        console.log(
            '========================================'
        );

        console.log(
            `Server berjalan di port ${PORT}`
        );

        console.log(
            `Admin upload: ${ADMIN_NAME}`
        );

        console.log(
            'Google Drive Frame : /get-frames'
        );

        console.log(
            'Google Drive Sticker : /get-stickers'
        );

        console.log(
            '========================================'
        );
    }
);
