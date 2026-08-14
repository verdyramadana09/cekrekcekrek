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
// GOOGLE DRIVE CONFIG
// =====================================================

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const GOOGLE_DRIVE_FOLDER_ID =
    process.env.GOOGLE_DRIVE_FOLDER_ID;


// =====================================================
// VALIDASI ENV
// =====================================================

if (!CLIENT_ID) {
    console.error('❌ CLIENT_ID belum diatur di .env');
}

if (!CLIENT_SECRET) {
    console.error('❌ CLIENT_SECRET belum diatur di .env');
}

if (!REFRESH_TOKEN) {
    console.error('❌ REFRESH_TOKEN belum diatur di .env');
}

if (!GOOGLE_DRIVE_FOLDER_ID) {
    console.error(
        '❌ GOOGLE_DRIVE_FOLDER_ID belum diatur di .env'
    );
}


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
// GOOGLE DRIVE API
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


    const uploaded =
        await drive.files.create({

            resource: fileMetadata,

            media: media,

            fields:
                'id, name, mimeType, webViewLink, webContentLink',

            supportsAllDrives: true

        });


    // =================================================
    // SET FILE AGAR BISA DIBACA
    // =================================================

    try {

        await drive.permissions.create({

            fileId:
                uploaded.data.id,

            requestBody: {

                role: 'reader',

                type: 'anyone'

            },

            supportsAllDrives: true

        });

    } catch (permissionError) {

        console.error(
            'Peringatan permission Google Drive:',
            permissionError.message
        );

        // Tidak langsung menggagalkan upload.
        // File sudah berhasil dibuat.
    }


    return {

        id:
            uploaded.data.id,

        name:
            uploaded.data.name,

        mimeType:
            uploaded.data.mimeType,

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
                '📁 Folder frame ditemukan:',
                response.data.files[0].id
            );

            return response.data.files[0].id;
        }


        // =================================================
        // JIKA FOLDER BELUM ADA
        // =================================================

        console.log(
            '📁 Folder frame belum ada.'
        );

        console.log(
            '📁 Membuat folder frame...'
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

                fields:
                    'id, name',

                supportsAllDrives: true

            });


        console.log(
            '✅ Folder frame berhasil dibuat:',
            folder.data.id
        );


        return folder.data.id;


    } catch (error) {

        console.error(
            '❌ Error saat mencari/membuat folder frame:',
            error
        );

        throw error;
    }
}


// =====================================================
// TAMBAHAN:
// FUNGSI MENCARI / MEMBUAT FOLDER "sticker"
// =====================================================

async function getOrCreateStickerFolder() {

    try {

        // =================================================
        // CARI FOLDER STICKER
        // =================================================

        const response =
            await drive.files.list({

                q:
                    `name = 'sticker' ` +
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
                '📁 Folder sticker ditemukan:',
                response.data.files[0].id
            );

            return response.data.files[0].id;
        }


        // =================================================
        // JIKA FOLDER BELUM ADA
        // =================================================

        console.log(
            '📁 Folder sticker belum ada.'
        );

        console.log(
            '📁 Membuat folder sticker...'
        );


        const folder =
            await drive.files.create({

                resource: {

                    name: 'sticker',

                    mimeType:
                        'application/vnd.google-apps.folder',

                    parents: [
                        GOOGLE_DRIVE_FOLDER_ID
                    ]

                },

                fields:
                    'id, name',

                supportsAllDrives: true

            });


        console.log(
            '✅ Folder sticker berhasil dibuat:',
            folder.data.id
        );


        return folder.data.id;


    } catch (error) {

        console.error(
            '❌ Error saat mencari/membuat folder sticker:',
            error
        );

        throw error;
    }
}


// =====================================================
// ENDPOINT PROXY FRAME GOOGLE DRIVE
//
// INI BAGIAN PENTING AGAR CANVAS DI INDEX.HTML
// BISA MEMBACA TRANSPARANSI GAMBAR FRAME.
//
// Browser:
// /frame/FILE_ID
//
// Server:
// Google Drive API
//
// Browser menerima gambar dari server sendiri.
// =====================================================

app.get(
    '/frame/:fileId',
    async (req, res) => {

        try {

            const fileId =
                req.params.fileId;


            // =================================================
            // VALIDASI FILE ID
            // =================================================

            if (!fileId) {

                return res
                    .status(400)
                    .send(
                        'File ID tidak ditemukan'
                    );
            }


            console.log(
                '🖼️ Meminta frame:',
                fileId
            );


            // =================================================
            // AMBIL METADATA FILE
            // =================================================

            const metadata =
                await drive.files.get({

                    fileId:
                        fileId,

                    fields:
                        'id, name, mimeType, size',

                    supportsAllDrives:
                        true

                });


            // =================================================
            // VALIDASI MIME TYPE
            // =================================================

            const mimeType =
                metadata.data.mimeType;


            if (
                !mimeType ||
                !mimeType.startsWith('image/')
            ) {

                return res
                    .status(400)
                    .send(
                        'File yang diminta bukan gambar.'
                    );
            }


            // =================================================
            // AMBIL FILE DARI GOOGLE DRIVE
            // =================================================

            const file =
                await drive.files.get(

                    {

                        fileId:
                            fileId,

                        alt:
                            'media',

                        supportsAllDrives:
                            true

                    },

                    {

                        responseType:
                            'stream'

                    }

                );


            // =================================================
            // HEADER RESPONSE
            // =================================================

            res.setHeader(
                'Content-Type',
                mimeType
            );


            res.setHeader(
                'Cache-Control',
                'public, max-age=3600'
            );


            // =================================================
            // KIRIM FILE KE BROWSER
            // =================================================

            file.data.pipe(res);


        } catch (error) {

            console.error(
                '❌ Error mengambil frame dari Google Drive:',
                error
            );


            if (!res.headersSent) {

                res
                    .status(500)
                    .send(
                        'Gagal mengambil frame dari Google Drive'
                    );

            }
        }

    }
);


// =====================================================
// ENDPOINT 1:
// UPLOAD SESSION
//
// BAGIAN INI DIPERTAHANKAN DARI SCRIPT ASLI
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

                        name:
                            sessionName,

                        mimeType:
                            'application/vnd.google-apps.folder',

                        parents: [
                            GOOGLE_DRIVE_FOLDER_ID
                        ]

                    },

                    fields:
                        'id, webViewLink',

                    supportsAllDrives:
                        true

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

                success:
                    true,

                folder_link:
                    folder.data.webViewLink

            });


        } catch (error) {

            console.error(
                '❌ Error upload session:',
                error
            );


            res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        'Gagal membuat folder',

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// ENDPOINT 2:
// UPLOAD CUSTOM FRAME
//
// FRAME MASUK KE:
// GOOGLE DRIVE
// └── FOLDER UTAMA
//     └── frame
//         └── frame.png
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
            // VALIDASI FRAME DATA
            // =================================================

            if (!frameData) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

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
            // CONVERT BASE64 KE BUFFER
            // =================================================

            const frameBuffer =
                Buffer.from(
                    base64Clean,
                    'base64'
                );


            // =================================================
            // VALIDASI BUFFER
            // =================================================

            if (
                !frameBuffer ||
                frameBuffer.length === 0
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        message:
                            'Data gambar tidak valid'

                    });

            }


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
            // FILE ID GOOGLE DRIVE
            // =================================================

            const fileId =
                uploaded.id;


            // =================================================
            // URL FRAME
            //
            // JANGAN gunakan:
            // drive.google.com/uc?export=view
            //
            // Gunakan proxy server sendiri.
            // =================================================

            const frameUrl =
                `/frame/${fileId}`;


            // =================================================
            // LOG
            // =================================================

            console.log(
                '=========================================='
            );

            console.log(
                '✅ FRAME BERHASIL DIUPLOAD'
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
                frameUrl
            );

            console.log(
                '=========================================='
            );


            // =================================================
            // RESPONSE KE FRONTEND
            // =================================================

            res.json({

                success:
                    true,

                frame_id:
                    fileId,

                frame_name:
                    uploaded.name,

                frame_url:
                    frameUrl

            });


        } catch (error) {

            console.error(
                '=========================================='
            );

            console.error(
                '❌ ERROR UPLOAD FRAME'
            );

            console.error(
                error
            );

            console.error(
                '=========================================='
            );


            res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        'Gagal mengunggah frame ke Google Drive',

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// ENDPOINT 3:
// AMBIL DAFTAR FRAME
// DARI FOLDER "frame"
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
            // AMBIL FILE FRAME
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

                    supportsAllDrives:
                        true,

                    includeItemsFromAllDrives:
                        true

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
                        file => ({

                            id:
                                file.id,

                            name:
                                file.name,

                            // =================================================
                            // PENTING
                            //
                            // URL menggunakan server sendiri.
                            // Ini memungkinkan canvas membaca gambar.
                            // =================================================

                            url:
                                `/frame/${file.id}`,

                            createdTime:
                                file.createdTime

                        })
                    );


            // =================================================
            // LOG
            // =================================================

            console.log(
                `📷 ${frames.length} frame ditemukan di Google Drive`
            );


            // =================================================
            // RESPONSE
            // =================================================

            res.json({

                success:
                    true,

                frames:
                    frames

            });


        } catch (error) {

            console.error(
                '❌ Error get frames:',
                error
            );


            res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        'Gagal memuat daftar frame',

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// TAMBAHAN:
// ENDPOINT UPLOAD STIKER PNG
//
// HANYA USER DENGAN NAMA "cekrek"
// YANG BOLEH UPLOAD
// =====================================================

app.post(
    '/upload-sticker',
    async (req, res) => {

        try {

            const {
                adminName,
                stickerName,
                stickerData
            } = req.body;


            // =================================================
            // VALIDASI NAMA ADMIN
            // =================================================

            if (
                String(adminName || '')
                    .trim()
                    .toLowerCase() !== 'cekrek'
            ) {

                return res
                    .status(403)
                    .json({

                        success:
                            false,

                        message:
                            'Anda tidak memiliki akses upload sticker.'

                    });

            }


            // =================================================
            // VALIDASI DATA
            // =================================================

            if (!stickerData) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        message:
                            'Data sticker tidak ditemukan'

                    });

            }


            // =================================================
            // CARI / BUAT FOLDER STICKER
            // =================================================

            const stickerFolderId =
                await getOrCreateStickerFolder();


            // =================================================
            // BERSIHKAN BASE64
            // =================================================

            const base64Clean =
                stickerData.replace(
                    /^data:image\/\w+;base64,/,
                    ''
                );


            // =================================================
            // CONVERT BASE64 KE BUFFER
            // =================================================

            const stickerBuffer =
                Buffer.from(
                    base64Clean,
                    'base64'
                );


            // =================================================
            // VALIDASI BUFFER
            // =================================================

            if (
                !stickerBuffer ||
                stickerBuffer.length === 0
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        message:
                            'Data sticker tidak valid'

                    });

            }


            // =================================================
            // NAMA FILE
            // =================================================

            let fileName =
                stickerName ||
                `Sticker_${Date.now()}.png`;


            // =================================================
            // PASTIKAN EXTENSION PNG
            // =================================================

            if (
                !fileName
                    .toLowerCase()
                    .endsWith('.png')
            ) {

                fileName += '.png';

            }


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
            // URL STICKER
            //
            // Sticker menggunakan endpoint proxy yang sama
            // agar aman dibaca browser.
            // =================================================

            const stickerUrl =
                `/frame/${uploaded.id}`;


            // =================================================
            // LOG
            // =================================================

            console.log(
                '=========================================='
            );

            console.log(
                '✅ STICKER PNG BERHASIL DIUPLOAD'
            );

            console.log(
                'Nama:',
                uploaded.name
            );

            console.log(
                'ID:',
                uploaded.id
            );

            console.log(
                'URL:',
                stickerUrl
            );

            console.log(
                '=========================================='
            );


            // =================================================
            // RESPONSE
            // =================================================

            res.json({

                success:
                    true,

                sticker_id:
                    uploaded.id,

                sticker_name:
                    uploaded.name,

                sticker_url:
                    stickerUrl

            });


        } catch (error) {

            console.error(
                '=========================================='
            );

            console.error(
                '❌ ERROR UPLOAD STICKER'
            );

            console.error(
                error
            );

            console.error(
                '=========================================='
            );


            res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        'Gagal mengunggah sticker ke Google Drive',

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// TAMBAHAN:
// ENDPOINT AMBIL SEMUA STIKER
//
// SEMUA USER BISA MENGAMBIL DATA INI
// =====================================================

app.get(
    '/get-stickers',
    async (req, res) => {

        try {

            // =================================================
            // CARI / BUAT FOLDER STICKER
            // =================================================

            const stickerFolderId =
                await getOrCreateStickerFolder();


            // =================================================
            // AMBIL SEMUA FILE
            // =================================================

            const response =
                await drive.files.list({

                    q:
                        `'${stickerFolderId}' in parents ` +
                        `and trashed = false`,

                    fields:
                        'files(id, name, mimeType, createdTime)',

                    orderBy:
                        'createdTime',

                    supportsAllDrives:
                        true,

                    includeItemsFromAllDrives:
                        true

                });


            // =================================================
            // FILTER FILE PNG / GAMBAR
            // =================================================

            const stickers =
                response.data.files

                    .filter(
                        file =>

                            file.mimeType &&
                            file.mimeType.startsWith(
                                'image/'
                            )

                    )

                    .map(
                        file => ({

                            id:
                                file.id,

                            name:
                                file.name,

                            url:
                                `/frame/${file.id}`,

                            createdTime:
                                file.createdTime

                        })
                    );


            // =================================================
            // LOG
            // =================================================

            console.log(
                `🎨 ${stickers.length} sticker ditemukan di Google Drive`
            );


            // =================================================
            // RESPONSE
            // =================================================

            res.json({

                success:
                    true,

                stickers:
                    stickers

            });


        } catch (error) {

            console.error(
                '❌ Error get stickers:',
                error
            );


            res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        'Gagal memuat daftar sticker',

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
// ERROR HANDLER
// =====================================================

app.use(
    (err, req, res, next) => {

        console.error(
            '❌ Unhandled server error:',
            err
        );


        if (res.headersSent) {
            return next(err);
        }


        res
            .status(500)
            .json({

                success:
                    false,

                message:
                    'Terjadi kesalahan pada server',

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
            '=========================================='
        );

        console.log(
            '🚀 SERVER PHOTOBOOTH BERJALAN'
        );

        console.log(
            `🌐 Port: ${PORT}`
        );

        console.log(
            `🌐 URL: http://localhost:${PORT}`
        );

        console.log(
            '☁️ Google Drive Frame System: AKTIF'
        );

        console.log(
            '🖼️ Frame Proxy: AKTIF'
        );

        console.log(
            '🎨 Google Drive Sticker System: AKTIF'
        );

        console.log(
            '=========================================='
        );

    }
);
