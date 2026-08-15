require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const stream = require('stream');
const crypto = require('crypto');

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
// ADMIN CONFIG
// =====================================================

const ADMIN_USERNAME = 'cekrek';

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || '';

const ADMIN_SESSION_SECRET =
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    'CHANGE_THIS_SECRET';


// =====================================================
// FRAME CONFIG FILE
// =====================================================

const FRAME_CONFIG_FILE_NAME =
    'frame-config.json';

let frameConfigFileId = null;

let frameConfigCache = {
    version: 1,
    frames: {}
};


// =====================================================
// VALIDASI ENV
// =====================================================

if (!CLIENT_ID) {
    console.error(
        '❌ CLIENT_ID belum diatur di .env'
    );
}

if (!CLIENT_SECRET) {
    console.error(
        '❌ CLIENT_SECRET belum diatur di .env'
    );
}

if (!REFRESH_TOKEN) {
    console.error(
        '❌ REFRESH_TOKEN belum diatur di .env'
    );
}

if (!GOOGLE_DRIVE_FOLDER_ID) {
    console.error(
        '❌ GOOGLE_DRIVE_FOLDER_ID belum diatur di .env'
    );
}

if (!ADMIN_PASSWORD) {
    console.error(
        '❌ ADMIN_PASSWORD belum diatur di .env'
    );
}


// =====================================================
// GOOGLE OAUTH2
// =====================================================

const oauth2Client =
    new google.auth.OAuth2(
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
// UPLOAD BUFFER KE GOOGLE DRIVE
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

    const uploaded =
        await drive.files.create({

            resource: {
                name: fileName,
                parents: [parentFolderId]
            },

            media: {
                mimeType: mimeType,
                body: bufferStream
            },

            fields:
                'id,name,mimeType,webViewLink,webContentLink',

            supportsAllDrives: true

        });


    // -------------------------------------------------
    // FILE BISA DIBACA
    // -------------------------------------------------

    try {

        await drive.permissions.create({

            fileId: uploaded.data.id,

            requestBody: {
                role: 'reader',
                type: 'anyone'
            },

            supportsAllDrives: true

        });

    } catch (error) {

        console.error(
            '⚠️ Permission Drive:',
            error.message
        );

    }


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
// CARI / BUAT FOLDER FRAME
// =====================================================

async function getOrCreateFrameFolder() {

    const response =
        await drive.files.list({

            q:
                `name = 'frame' ` +
                `and '${GOOGLE_DRIVE_FOLDER_ID}' in parents ` +
                `and mimeType = 'application/vnd.google-apps.folder' ` +
                `and trashed = false`,

            fields:
                'files(id,name)',

            supportsAllDrives: true,

            includeItemsFromAllDrives: true

        });


    if (
        response.data.files &&
        response.data.files.length
    ) {

        return response.data.files[0].id;

    }


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

            fields: 'id,name',

            supportsAllDrives: true

        });


    return folder.data.id;

}


// =====================================================
// CARI / BUAT FOLDER STICKER
// =====================================================

async function getOrCreateStickerFolder() {

    const response =
        await drive.files.list({

            q:
                `name = 'sticker' ` +
                `and '${GOOGLE_DRIVE_FOLDER_ID}' in parents ` +
                `and mimeType = 'application/vnd.google-apps.folder' ` +
                `and trashed = false`,

            fields:
                'files(id,name)',

            supportsAllDrives: true,

            includeItemsFromAllDrives: true

        });


    if (
        response.data.files &&
        response.data.files.length
    ) {

        return response.data.files[0].id;

    }


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

            fields: 'id,name',

            supportsAllDrives: true

        });


    return folder.data.id;

}


// =====================================================
// FRAME PROXY
// =====================================================

app.get(
    '/frame/:fileId',
    async (req, res) => {

        try {

            const fileId =
                req.params.fileId;

            if (!fileId) {

                return res
                    .status(400)
                    .send(
                        'File ID tidak ditemukan'
                    );

            }


            const metadata =
                await drive.files.get({

                    fileId: fileId,

                    fields:
                        'id,name,mimeType,size',

                    supportsAllDrives: true

                });


            const mimeType =
                metadata.data.mimeType;


            if (
                !mimeType ||
                !mimeType.startsWith('image/')
            ) {

                return res
                    .status(400)
                    .send(
                        'File bukan gambar'
                    );

            }


            const file =
                await drive.files.get(

                    {
                        fileId: fileId,

                        alt: 'media',

                        supportsAllDrives: true
                    },

                    {
                        responseType: 'stream'
                    }

                );


            res.setHeader(
                'Content-Type',
                mimeType
            );

            res.setHeader(
                'Cache-Control',
                'public,max-age=3600'
            );


            file.data.pipe(res);


        } catch (error) {

            console.error(
                '❌ Error frame:',
                error
            );


            if (!res.headersSent) {

                res
                    .status(500)
                    .send(
                        'Gagal mengambil frame'
                    );

            }

        }

    }
);


// =====================================================
// UPLOAD SESSION
// =====================================================

app.post(
    '/upload-session',
    async (req, res) => {

        try {

            const {
                sessionName: clientSessionName,
                date,
                frameImage,
                individualImages,
                gifImage
            } = req.body;


            const safeSessionName =
                String(
                    clientSessionName ||
                    `Sesi_${Date.now()}`
                )
                    .trim()
                    .replace(
                        /[<>:"/\\|?*]+/g,
                        ''
                    )
                    .replace(
                        /\s+/g,
                        '_'
                    )
                    .replace(
                        /_+/g,
                        '_'
                    )
                    .replace(
                        /^_+|_+$/g,
                        ''
                    )
                    .substring(0, 80)
                    ||
                    `Sesi_${Date.now()}`;


            const safeDate =
                String(date || '')
                    .trim()
                    .replace(
                        /[<>:"/\\|?*]+/g,
                        ''
                    )
                    .replace(
                        /\s+/g,
                        '_'
                    )
                    .substring(0, 30);


            const sessionFolderName =
                safeDate
                    ? `${safeSessionName}_${safeDate}`
                    : safeSessionName;


            // -------------------------------------------------
            // BUAT FOLDER SESSION
            // -------------------------------------------------

            const folder =
                await drive.files.create({

                    resource: {

                        name:
                            sessionFolderName,

                        mimeType:
                            'application/vnd.google-apps.folder',

                        parents: [
                            GOOGLE_DRIVE_FOLDER_ID
                        ]

                    },

                    fields:
                        'id,webViewLink',

                    supportsAllDrives: true

                });


            const subFolderId =
                folder.data.id;


            // -------------------------------------------------
            // FRAME HASIL
            // -------------------------------------------------

            if (frameImage) {

                const buffer =
                    Buffer.from(

                        frameImage.replace(
                            /^data:image\/\w+;base64,/,
                            ''
                        ),

                        'base64'

                    );


                await uploadBufferToDrive(

                    buffer,

                    'Hasil_Frame.png',

                    'image/png',

                    subFolderId

                );

            }


            // -------------------------------------------------
            // FOTO SATUAN
            // -------------------------------------------------

            if (
                Array.isArray(
                    individualImages
                )
            ) {

                for (
                    let i = 0;
                    i < individualImages.length;
                    i++
                ) {

                    const buffer =
                        Buffer.from(

                            individualImages[i]
                                .replace(
                                    /^data:image\/\w+;base64,/,
                                    ''
                                ),

                            'base64'

                        );


                    await uploadBufferToDrive(

                        buffer,

                        `Foto_Satuan_${i + 1}.png`,

                        'image/png',

                        subFolderId

                    );

                }

            }


            // -------------------------------------------------
            // GIF
            // -------------------------------------------------

            if (gifImage) {

                const buffer =
                    Buffer.from(

                        gifImage.replace(
                            /^data:image\/\w+;base64,/,
                            ''
                        ),

                        'base64'

                    );


                await uploadBufferToDrive(

                    buffer,

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
                '❌ Error upload session:',
                error
            );


            res
                .status(500)
                .json({

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
// UPLOAD CUSTOM FRAME
// =====================================================
//
// Untuk keamanan, endpoint ini sekarang juga wajib
// memakai token admin cekrek.
//
// =====================================================

app.post(
    '/upload-frame',
    requireFrameAdmin,
    async (req, res) => {

        try {

            const {
                frameName,
                frameData
            } = req.body;


            if (!frameData) {

                return res
                    .status(400)
                    .json({

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
                    ''
                );


            const frameBuffer =
                Buffer.from(
                    base64Clean,
                    'base64'
                );


            if (
                !frameBuffer ||
                frameBuffer.length === 0
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            'Data gambar tidak valid'

                    });

            }


            const fileName =
                frameName ||
                `Custom_Frame_${Date.now()}.png`;


            const uploaded =
                await uploadBufferToDrive(

                    frameBuffer,

                    fileName,

                    'image/png',

                    frameFolderId

                );


            const fileId =
                uploaded.id;


            const frameUrl =
                `/frame/${fileId}`;


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
                '=========================================='
            );


            res.json({

                success: true,

                frame_id:
                    fileId,

                frame_name:
                    uploaded.name,

                frame_url:
                    frameUrl

            });


        } catch (error) {

            console.error(
                '❌ ERROR UPLOAD FRAME:',
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    message:
                        'Gagal mengunggah frame',

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// GET FRAMES
// =====================================================

app.get(
    '/get-frames',
    async (req, res) => {

        try {

            const frameFolderId =
                await getOrCreateFrameFolder();


            const response =
                await drive.files.list({

                    q:
                        `'${frameFolderId}' in parents ` +
                        `and trashed = false`,

                    fields:
                        'files(id,name,mimeType,createdTime)',

                    orderBy:
                        'createdTime',

                    supportsAllDrives: true,

                    includeItemsFromAllDrives:
                        true

                });


            const frames =
                (response.data.files || [])

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


            res.json({

                success: true,

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
// UPLOAD STICKER
// =====================================================
//
// SEKARANG HANYA ADMIN CEKREK
// YANG BOLEH MENGUPLOAD STICKER.
//
// =====================================================

app.post(
    '/upload-sticker',
    requireFrameAdmin,
    async (req, res) => {

        try {

            const {
                stickerName,
                stickerData
            } = req.body;


            if (!stickerData) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            'Data sticker tidak ditemukan'

                    });

            }


            const stickerFolderId =
                await getOrCreateStickerFolder();


            const base64Clean =
                stickerData.replace(
                    /^data:image\/\w+;base64,/,
                    ''
                );


            const stickerBuffer =
                Buffer.from(
                    base64Clean,
                    'base64'
                );


            if (
                !stickerBuffer ||
                stickerBuffer.length === 0
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            'Data sticker tidak valid'

                    });

            }


            let fileName =
                stickerName ||
                `Sticker_${Date.now()}.png`;


            if (
                !fileName
                    .toLowerCase()
                    .endsWith('.png')
            ) {

                fileName += '.png';

            }


            const uploaded =
                await uploadBufferToDrive(

                    stickerBuffer,

                    fileName,

                    'image/png',

                    stickerFolderId

                );


            res.json({

                success: true,

                sticker_id:
                    uploaded.id,

                sticker_name:
                    uploaded.name,

                sticker_url:
                    `/frame/${uploaded.id}`

            });


        } catch (error) {

            console.error(
                '❌ ERROR UPLOAD STICKER:',
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    message:
                        'Gagal mengunggah sticker',

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// GET STICKERS
// =====================================================

app.get(
    '/get-stickers',
    async (req, res) => {

        try {

            const stickerFolderId =
                await getOrCreateStickerFolder();


            const response =
                await drive.files.list({

                    q:
                        `'${stickerFolderId}' in parents ` +
                        `and trashed = false`,

                    fields:
                        'files(id,name,mimeType,createdTime)',

                    orderBy:
                        'createdTime',

                    supportsAllDrives: true,

                    includeItemsFromAllDrives:
                        true

                });


            const stickers =
                (response.data.files || [])

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


            res.json({

                success: true,

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

                    success: false,

                    message:
                        'Gagal memuat daftar sticker',

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// FRAME CONFIGURATION API
// =====================================================
//
// FORMAT DATA:
//
// {
//   "photoMap": [1,2,1,3],
//   "colors": ["#ff0000","#0000ff","#00ff00"]
// }
//
// photoMap = nomor foto untuk setiap lubang.
// colors  = warna berdasarkan nomor foto.
//
// User biasa:
// GET.
//
// Admin cekrek:
// LOGIN + PUT/DELETE.
//
// =====================================================


// =====================================================
// BANDINGKAN STRING SECARA AMAN
// =====================================================

function safeEqualText(a, b) {

    const aa =
        Buffer.from(
            String(a || '')
        );

    const bb =
        Buffer.from(
            String(b || '')
        );


    if (
        aa.length !== bb.length
    ) {

        return false;

    }


    return crypto.timingSafeEqual(
        aa,
        bb
    );

}


// =====================================================
// BUAT TOKEN ADMIN
// =====================================================

function createAdminToken() {

    const payload = {

        username:
            ADMIN_USERNAME,

        expires:
            Date.now() +
            (12 * 60 * 60 * 1000)

    };


    const body =
        Buffer
            .from(
                JSON.stringify(payload)
            )
            .toString(
                'base64url'
            );


    const signature =
        crypto
            .createHmac(
                'sha256',
                ADMIN_SESSION_SECRET
            )
            .update(body)
            .digest(
                'base64url'
            );


    return `${body}.${signature}`;

}


// =====================================================
// VALIDASI TOKEN ADMIN
// =====================================================

function verifyAdminToken(token) {

    try {

        if (
            !token ||
            typeof token !== 'string'
        ) {

            return false;

        }


        const parts =
            token.split('.');


        if (
            parts.length !== 2
        ) {

            return false;

        }


        const body =
            parts[0];

        const signature =
            parts[1];


        const expected =
            crypto
                .createHmac(
                    'sha256',
                    ADMIN_SESSION_SECRET
                )
                .update(body)
                .digest(
                    'base64url'
                );


        if (
            !safeEqualText(
                signature,
                expected
            )
        ) {

            return false;

        }


        const payload =
            JSON.parse(

                Buffer
                    .from(
                        body,
                        'base64url'
                    )
                    .toString(
                        'utf8'
                    )

            );


        return (
            payload &&
            payload.username ===
                ADMIN_USERNAME &&
            Number(payload.expires) >
                Date.now()
        );


    } catch (error) {

        return false;

    }

}


// =====================================================
// MIDDLEWARE ADMIN
// =====================================================

function requireFrameAdmin(
    req,
    res,
    next
) {

    const authorization =
        req.headers.authorization || '';


    const token =
        authorization.startsWith(
            'Bearer '
        )
            ? authorization
                .slice(7)
                .trim()
            : '';


    if (
        !verifyAdminToken(token)
    ) {

        return res
            .status(401)
            .json({

                success: false,

                message:
                    'Akses admin diperlukan.'

            });

    }


    next();

}


// =====================================================
// NORMALISASI KEY FRAME
// =====================================================

function normalizeFrameKey(value) {

    return String(value || '')
        .trim()
        .replace(
            /\\/g,
            '/'
        )
        .replace(
            /^\/+|\/+$/g,
            ''
        );

}


// =====================================================
// NORMALISASI CONFIG FRAME
// =====================================================

function normalizeFrameConfig(frame) {

    const source =
        frame &&
        typeof frame === 'object'
            ? frame
            : {};


    const photoMap =
        Array.isArray(
            source.photoMap
        )

            ? source.photoMap.map(
                (value, index) => {

                    const number =
                        parseInt(
                            value,
                            10
                        );


                    return (
                        Number.isFinite(
                            number
                        ) &&
                        number >= 1
                    )
                        ? number
                        : index + 1;

                }
            )

            : [];


    const colors =
        Array.isArray(
            source.colors
        )

            ? source.colors.map(
                value =>
                    String(
                        value || ''
                    ).trim()
            )

            : [];


    return {

        photoMap,

        colors,

        updatedAt:
            source.updatedAt ||
            new Date().toISOString()

    };

}


// =====================================================
// CARI FILE KONFIGURASI FRAME
// =====================================================

async function findFrameConfigFile() {

    if (
        frameConfigFileId
    ) {

        return frameConfigFileId;

    }


    const response =
        await drive.files.list({

            q:
                `'${GOOGLE_DRIVE_FOLDER_ID}' in parents ` +
                `and name = '${FRAME_CONFIG_FILE_NAME}' ` +
                `and trashed = false`,

            fields:
                'files(id,name,mimeType)',

            pageSize: 10,

            supportsAllDrives: true,

            includeItemsFromAllDrives:
                true

        });


    const file =
        response.data.files &&
        response.data.files[0];


    if (
        file &&
        file.id
    ) {

        frameConfigFileId =
            file.id;

        return file.id;

    }


    return null;

}


// =====================================================
// BACA CONFIG DARI GOOGLE DRIVE
// =====================================================

async function readFrameConfigFromDrive() {

    const fileId =
        await findFrameConfigFile();


    if (!fileId) {

        frameConfigCache = {

            version: 1,

            frames: {}

        };


        return frameConfigCache;

    }


    const response =
        await drive.files.get({

            fileId,

            alt: 'media',

            supportsAllDrives: true

        });


    const data =
        response.data &&
        typeof response.data === 'object'
            ? response.data
            : {};


    frameConfigCache = {

        version: 1,

        frames:
            data.frames &&
            typeof data.frames === 'object'
                ? data.frames
                : {}

    };


    return frameConfigCache;

}


// =====================================================
// SIMPAN CONFIG KE GOOGLE DRIVE
// =====================================================

async function saveFrameConfigToDrive(
    config
) {

    const body =
        JSON.stringify(
            config,
            null,
            2
        );


    const bodyStream =
        new stream.PassThrough();


    bodyStream.end(
        Buffer.from(
            body,
            'utf8'
        )
    );


    const fileId =
        await findFrameConfigFile();


    if (fileId) {

        await drive.files.update({

            fileId,

            media: {

                mimeType:
                    'application/json',

                body:
                    bodyStream

            },

            fields:
                'id,name,modifiedTime',

            supportsAllDrives:
                true

        });


    } else {

        const created =
            await drive.files.create({

                resource: {

                    name:
                        FRAME_CONFIG_FILE_NAME,

                    parents: [
                        GOOGLE_DRIVE_FOLDER_ID
                    ],

                    mimeType:
                        'application/json'

                },

                media: {

                    mimeType:
                        'application/json',

                    body:
                        bodyStream

                },

                fields:
                    'id,name,modifiedTime',

                supportsAllDrives:
                    true

            });


        frameConfigFileId =
            created.data.id;

    }


    frameConfigCache =
        config;


    return config;

}


// =====================================================
// LOGIN ADMIN CEKREK
// =====================================================

app.post(
    '/api/frame-config/login',
    async (req, res) => {

        try {

            const username =
                String(
                    req.body &&
                    req.body.username ||
                    ''
                )
                    .trim();


            const password =
                String(
                    req.body &&
                    req.body.password ||
                    ''
                );


            if (
                username.toLowerCase() !==
                    ADMIN_USERNAME ||

                !ADMIN_PASSWORD ||

                !safeEqualText(
                    password,
                    ADMIN_PASSWORD
                )
            ) {

                return res
                    .status(401)
                    .json({

                        success: false,

                        message:
                            'Username atau password admin salah.'

                    });

            }


            return res.json({

                success: true,

                username:
                    ADMIN_USERNAME,

                token:
                    createAdminToken(),

                expiresIn:
                    12 * 60 * 60

            });


        } catch (error) {

            console.error(
                '❌ Login admin:',
                error
            );


            return res
                .status(500)
                .json({

                    success: false,

                    message:
                        'Gagal melakukan login admin.'

                });

        }

    }
);


// =====================================================
// CEK ADMIN
// =====================================================

app.get(
    '/api/frame-config/admin-check',
    requireFrameAdmin,
    (req, res) => {

        res.json({

            success: true,

            admin:
                ADMIN_USERNAME

        });

    }
);


// =====================================================
// USER + ADMIN:
// BACA SEMUA CONFIG
// =====================================================

app.get(
    '/api/frame-config',
    async (req, res) => {

        try {

            const config =
                await readFrameConfigFromDrive();


            return res.json({

                success: true,

                version:
                    config.version || 1,

                frames:
                    config.frames || {}

            });


        } catch (error) {

            console.error(
                '❌ Gagal membaca config:',
                error
            );


            return res
                .status(500)
                .json({

                    success: false,

                    message:
                        'Gagal membaca konfigurasi frame.'

                });

        }

    }
);


// =====================================================
// USER + ADMIN:
// BACA SATU FRAME
// =====================================================

app.get(
    '/api/frame-config/:frameKey',
    async (req, res) => {

        try {

            const frameKey =
                normalizeFrameKey(
                    req.params.frameKey
                );


            const config =
                await readFrameConfigFromDrive();


            return res.json({

                success: true,

                frameKey,

                config:
                    config.frames[
                        frameKey
                    ] || null

            });


        } catch (error) {

            console.error(
                '❌ Gagal membaca config frame:',
                error
            );


            return res
                .status(500)
                .json({

                    success: false,

                    message:
                        'Gagal membaca konfigurasi frame.'

                });

        }

    }
);


// =====================================================
// ADMIN SAJA:
// SIMPAN SATU CONFIG FRAME
// =====================================================

app.put(
    '/api/frame-config/:frameKey',
    requireFrameAdmin,
    async (req, res) => {

        try {

            const frameKey =
                normalizeFrameKey(
                    req.params.frameKey
                );


            if (!frameKey) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            'frameKey tidak boleh kosong.'

                    });

            }


            const config =
                await readFrameConfigFromDrive();


            const frameConfig =
                normalizeFrameConfig(
                    req.body
                );


            config.frames[
                frameKey
            ] = frameConfig;


            config.version = 1;

            config.updatedAt =
                new Date().toISOString();


            await saveFrameConfigToDrive(
                config
            );


            return res.json({

                success: true,

                frameKey,

                config:
                    frameConfig

            });


        } catch (error) {

            console.error(
                '❌ Gagal menyimpan config:',
                error
            );


            return res
                .status(500)
                .json({

                    success: false,

                    message:
                        'Gagal menyimpan konfigurasi frame.',

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// ADMIN SAJA:
// SIMPAN SEMUA CONFIG
// =====================================================

app.put(
    '/api/frame-config',
    requireFrameAdmin,
    async (req, res) => {

        try {

            const incoming =
                req.body &&
                req.body.frames;


            if (
                !incoming ||
                typeof incoming !== 'object' ||
                Array.isArray(incoming)
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        message:
                            'Data frames tidak valid.'

                    });

            }


            const frames = {};


            Object.keys(
                incoming
            ).forEach(
                key => {

                    const normalizedKey =
                        normalizeFrameKey(
                            key
                        );


                    if (
                        normalizedKey
                    ) {

                        frames[
                            normalizedKey
                        ] =
                            normalizeFrameConfig(
                                incoming[key]
                            );

                    }

                }
            );


            const config = {

                version: 1,

                frames,

                updatedAt:
                    new Date().toISOString()

            };


            await saveFrameConfigToDrive(
                config
            );


            return res.json({

                success: true,

                frames:
                    config.frames

            });


        } catch (error) {

            console.error(
                '❌ Gagal menyimpan semua config:',
                error
            );


            return res
                .status(500)
                .json({

                    success: false,

                    message:
                        'Gagal menyimpan semua konfigurasi frame.',

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// ADMIN SAJA:
// HAPUS CONFIG FRAME
// =====================================================

app.delete(
    '/api/frame-config/:frameKey',
    requireFrameAdmin,
    async (req, res) => {

        try {

            const frameKey =
                normalizeFrameKey(
                    req.params.frameKey
                );


            const config =
                await readFrameConfigFromDrive();


            delete config.frames[
                frameKey
            ];


            config.updatedAt =
                new Date().toISOString();


            await saveFrameConfigToDrive(
                config
            );


            return res.json({

                success: true,

                frameKey

            });


        } catch (error) {

            console.error(
                '❌ Gagal menghapus config:',
                error
            );


            return res
                .status(500)
                .json({

                    success: false,

                    message:
                        'Gagal menghapus konfigurasi frame.'

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


        if (
            res.headersSent
        ) {

            return next(err);

        }


        res
            .status(500)
            .json({

                success: false,

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
            '⚙️ Frame Configuration API: AKTIF'
        );

        console.log(
            '🔐 Admin Frame: cekrek'
        );

        console.log(
            '=========================================='
        );

    }
);
