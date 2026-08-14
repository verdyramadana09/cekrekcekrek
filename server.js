require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const stream = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());

app.use(
    express.json({
        limit: '100mb'
    })
);

app.use(express.static(__dirname));


// =====================================================
// GOOGLE DRIVE CONFIGURATION
// =====================================================

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const GOOGLE_DRIVE_FOLDER_ID =
    process.env.GOOGLE_DRIVE_FOLDER_ID;


// =====================================================
// GOOGLE OAUTH2
// =====================================================

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
    refresh_token: REFRESH_TOKEN
});


// =====================================================
// GOOGLE DRIVE
// =====================================================

const drive = google.drive({
    version: 'v3',
    auth: oauth2Client
});


// =====================================================
// FUNGSI UPLOAD BUFFER KE GOOGLE DRIVE
// =====================================================

async function uploadBufferToDrive(
    buffer,
    fileName,
    mimeType,
    parentFolderId
) {
    const bufferStream =
        new stream.PassThrough();

    bufferStream.end(buffer);

    const fileMetadata = {
        name: fileName,
        parents: [parentFolderId]
    };

    const media = {
        mimeType: mimeType,
        body: bufferStream
    };

    // Upload file
    const uploaded =
        await drive.files.create({
            resource: fileMetadata,

            media: media,

            fields:
                'id, name, mimeType, webViewLink, webContentLink',

            supportsAllDrives: true
        });


    // =================================================
    // SET PERMISSION AGAR BISA DIBACA PUBLIK
    // =================================================

    await drive.permissions.create({
        fileId: uploaded.data.id,

        requestBody: {
            role: 'reader',
            type: 'anyone'
        },

        supportsAllDrives: true
    });


    // =================================================
    // KEMBALIKAN DATA LENGKAP
    // =================================================

    return {
        id: uploaded.data.id,

        name: uploaded.data.name,

        mimeType: uploaded.data.mimeType,

        webViewLink:
            uploaded.data.webViewLink || null,

        webContentLink:
            uploaded.data.webContentLink || null
    };
}


// =====================================================
// FUNGSI MENCARI / MEMBUAT FOLDER "frame"
// =====================================================

async function getOrCreateFrameFolder() {

    try {

        // =================================================
        // CARI FOLDER FRAME
        // =================================================

        const response =
            await drive.files.list({

                q:
                    `name = 'frame' ` +
                    `and '${GOOGLE_DRIVE_FOLDER_ID}' in parents ` +
                    `and mimeType = 'application/vnd.google-apps.folder' ` +
                    `and trashed = false`,

                fields:
                    'files(id, name)',

                supportsAllDrives: true,

                includeItemsFromAllDrives: true
            });


        // =================================================
        // JIKA FOLDER SUDAH ADA
        // =================================================

        if (
            response.data.files &&
            response.data.files.length > 0
        ) {

            console.log(
                'Folder frame ditemukan:',
                response.data.files[0].id
            );

            return response.data.files[0].id;
        }


        // =================================================
        // JIKA BELUM ADA → BUAT FOLDER BARU
        // =================================================

        console.log(
            'Folder frame belum ada. Membuat folder baru...'
        );

        const folder =
            await drive.files.create({

                resource: {

                    name: 'frame',

                    mimeType:
                        'application/vnd.google-apps.folder',

                    parents: [
                        GOOGLE_DRIVE_FOLDER_ID
                    ]
                },

                fields: 'id, name',

                supportsAllDrives: true
            });


        console.log(
            'Folder frame berhasil dibuat:',
            folder.data.id
        );

        return folder.data.id;

    } catch (error) {

        console.error(
            'Error saat mencari/membuat folder frame:',
            error
        );

        throw error;
    }
}


// =====================================================
// ENDPOINT 1
// UPLOAD SESSION
// TETAP SEPERTI SCRIPT ASLI
// =====================================================

app.post(
    '/upload-session',
    async (req, res) => {

        try {

            const {
                frameImage,
                individualImages,
                gifImage
            } = req.body;


            const sessionName =
                `Sesi_${Date.now()}`;


            // =================================================
            // BUAT FOLDER SESSION
            // =================================================

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

                    fields:
                        'id, webViewLink',

                    supportsAllDrives: true
                });


            const subFolderId =
                folder.data.id;


            // =================================================
            // 1. UPLOAD HASIL FRAME
            // =================================================

            if (frameImage) {

                const frameBuffer =
                    Buffer.from(
                        frameImage.replace(
                            /^data:image\/\w+;base64,/,
                            ''
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

                    const singleBuffer =
                        Buffer.from(
                            individualImages[i].replace(
                                /^data:image\/\w+;base64,/,
                                ''
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
                        gifImage.replace(
                            /^data:image\/\w+;base64,/,
                            ''
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


            // =================================================
            // RESPONSE
            // =================================================

            res.json({

                success: true,

                folder_link:
                    folder.data.webViewLink
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
    }
);


// =====================================================
// ENDPOINT 2
// UPLOAD CUSTOM FRAME
// KE FOLDER "frame"
// =====================================================

app.post(
    '/upload-frame',
    async (req, res) => {

        try {

            const {
                frameName,
                frameData
            } = req.body;


            // =================================================
            // VALIDASI DATA
            // =================================================

            if (!frameData) {

                return res.status(400).json({

                    success: false,

                    message:
                        'Data frame tidak ditemukan'
                });
            }


            // =================================================
            // CARI / BUAT FOLDER FRAME
            // =================================================

            const frameFolderId =
                await getOrCreateFrameFolder();


            // =================================================
            // BERSIHKAN BASE64
            // =================================================

            const base64Clean =
                frameData.replace(
                    /^data:image\/\w+;base64,/,
                    ''
                );


            // =================================================
            // CONVERT BASE64 → BUFFER
            // =================================================

            const frameBuffer =
                Buffer.from(
                    base64Clean,
                    'base64'
                );


            // =================================================
            // NAMA FILE
            // =================================================

            const fileName =
                frameName ||
                `Custom_Frame_${Date.now()}.png`;


            // =================================================
            // UPLOAD KE GOOGLE DRIVE
            // =================================================

            const uploaded =
                await uploadBufferToDrive(

                    frameBuffer,

                    fileName,

                    'image/png',

                    frameFolderId
                );


            // =================================================
            // AMBIL FILE ID LANGSUNG
            // DARI GOOGLE DRIVE
            // =================================================

            const fileId =
                uploaded.id;


            // =================================================
            // URL GAMBAR
            // =================================================

            const directUrl =
                `https://drive.google.com/uc?export=view&id=${fileId}`;


            console.log(
                '===================================='
            );

            console.log(
                'FRAME BERHASIL DIUPLOAD'
            );

            console.log(
                'Nama:',
                uploaded.name
            );

            console.log(
                'ID:',
                fileId
            );

            console.log(
                'URL:',
                directUrl
            );

            console.log(
                '===================================='
            );


            // =================================================
            // RESPONSE KE FRONTEND
            // =================================================

            res.json({

                success: true,

                frame_id:
                    fileId,

                frame_name:
                    uploaded.name,

                frame_url:
                    directUrl
            });


        } catch (error) {

            console.error(
                '===================================='
            );

            console.error(
                'ERROR UPLOAD FRAME'
            );

            console.error(
                error
            );

            console.error(
                '===================================='
            );


            res.status(500).json({

                success: false,

                message:
                    'Gagal mengunggah frame ke Google Drive',

                error:
                    error.message
            });
        }
    }
);


// =====================================================
// ENDPOINT 3
// AMBIL SEMUA FRAME DARI FOLDER "frame"
// =====================================================

app.get(
    '/get-frames',
    async (req, res) => {

        try {

            // =================================================
            // CARI / BUAT FOLDER FRAME
            // =================================================

            const frameFolderId =
                await getOrCreateFrameFolder();


            // =================================================
            // AMBIL FILE DALAM FOLDER FRAME
            // =================================================

            const response =
                await drive.files.list({

                    q:
                        `'${frameFolderId}' in parents ` +
                        `and trashed = false`,

                    fields:
                        'files(id, name, mimeType, createdTime)',

                    orderBy:
                        'createdTime',

                    supportsAllDrives: true,

                    includeItemsFromAllDrives: true
                });


            // =================================================
            // FILTER FILE GAMBAR
            // =================================================

            const frames =
                response.data.files

                    .filter(
                        file =>
                            file.mimeType &&
                            file.mimeType.startsWith(
                                'image/'
                            )
                    )

                    .map(
                        file => {

                            return {

                                id:
                                    file.id,

                                name:
                                    file.name,

                                url:
                                    `https://drive.google.com/uc?export=view&id=${file.id}`,

                                createdTime:
                                    file.createdTime
                            };
                        }
                    );


            console.log(
                `Berhasil mengambil ${frames.length} frame dari Google Drive`
            );


            // =================================================
            // RESPONSE
            // =================================================

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
    }
);


// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
    '/',

    (req, res) => {

        res.send(
            'Server Photobooth berjalan.'
        );
    }
);


// =====================================================
// START SERVER
// =====================================================

app.listen(
    PORT,

    () => {

        console.log(
            '===================================='
        );

        console.log(
            `Server berjalan di port ${PORT}`
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log(
            'Google Drive Frame System: AKTIF'
        );

        console.log(
            '===================================='
        );
    }
);
