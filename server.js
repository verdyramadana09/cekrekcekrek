require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const stream = require('stream');
const crypto = require('crypto');

const app = express();

const PORT = process.env.PORT || 3000;


// =====================================================
// ADMIN
// =====================================================

const ADMIN_USERNAME = 'cekrek';

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || '';

const ADMIN_TOKEN_TTL_MS =
    12 * 60 * 60 * 1000;

const adminTokens = new Map();


// =====================================================
// FRAME CONFIG CACHE
// =====================================================

let frameConfigCache = null;
let frameConfigCacheLoadedAt = 0;

const FRAME_CONFIG_CACHE_TTL_MS = 5000;


// =====================================================
// GOOGLE DRIVE CONFIG
// =====================================================

const CLIENT_ID =
    process.env.CLIENT_ID;

const CLIENT_SECRET =
    process.env.CLIENT_SECRET;

const REFRESH_TOKEN =
    process.env.REFRESH_TOKEN;

const GOOGLE_DRIVE_FOLDER_ID =
    process.env.GOOGLE_DRIVE_FOLDER_ID;


// =====================================================
// ADMIN HELPER
// =====================================================

function isAdminName(value) {
    return (
        String(value || '')
            .trim()
            .toLowerCase() ===
        ADMIN_USERNAME
    );
}


function cleanupAdminTokens() {

    const now = Date.now();

    for (
        const [token, data]
        of adminTokens.entries()
    ) {

        if (
            !data ||
            data.expiresAt <= now
        ) {

            adminTokens.delete(token);

        }

    }

}


function createAdminToken() {

    cleanupAdminTokens();

    const token =
        crypto
            .randomBytes(32)
            .toString('hex');

    adminTokens.set(token, {

        username:
            ADMIN_USERNAME,

        expiresAt:
            Date.now() +
            ADMIN_TOKEN_TTL_MS

    });

    return token;

}


function requireAdmin(
    req,
    res,
    next
) {

    cleanupAdminTokens();

    const auth =
        String(
            req.get('authorization') || ''
        );

    const token =
        auth.startsWith('Bearer ')
            ? auth
                .slice(7)
                .trim()
            : '';

    const session =
        token
            ? adminTokens.get(token)
            : null;


    if (
        !session ||
        session.username !==
            ADMIN_USERNAME ||
        session.expiresAt <=
            Date.now()
    ) {

        return res
            .status(403)
            .json({

                success: false,

                message:
                    'Akses admin diperlukan.'

            });

    }


    req.adminName =
        ADMIN_USERNAME;

    req.adminToken =
        token;

    next();

}


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());

app.use(
    express.json({
        limit: '100mb'
    })
);

app.use(
    express.static(__dirname)
);


// =====================================================
// VALIDASI ENV
// =====================================================

if (!CLIENT_ID) {

    console.error(
        '❌ CLIENT_ID belum diatur.'
    );

}

if (!CLIENT_SECRET) {

    console.error(
        '❌ CLIENT_SECRET belum diatur.'
    );

}

if (!REFRESH_TOKEN) {

    console.error(
        '❌ REFRESH_TOKEN belum diatur.'
    );

}

if (!GOOGLE_DRIVE_FOLDER_ID) {

    console.error(
        '❌ GOOGLE_DRIVE_FOLDER_ID belum diatur.'
    );

}

if (!ADMIN_PASSWORD) {

    console.warn(
        '⚠️ ADMIN_PASSWORD belum diatur. Login cekrek tidak dapat digunakan.'
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

    refresh_token:
        REFRESH_TOKEN

});


// =====================================================
// GOOGLE DRIVE API
// =====================================================

const drive =
    google.drive({

        version: 'v3',

        auth:
            oauth2Client

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

                name:
                    fileName,

                parents: [
                    parentFolderId
                ]

            },

            media: {

                mimeType:
                    mimeType,

                body:
                    bufferStream

            },

            fields:
                'id,name,mimeType,webViewLink,webContentLink',

            supportsAllDrives:
                true

        });


    try {

        await drive.permissions.create({

            fileId:
                uploaded.data.id,

            requestBody: {

                role:
                    'reader',

                type:
                    'anyone'

            },

            supportsAllDrives:
                true

        });

    } catch (permissionError) {

        console.error(
            '⚠️ Permission Google Drive:',
            permissionError.message
        );

    }


    return {

        id:
            uploaded.data.id,

        name:
            uploaded.data.name,

        mimeType:
            uploaded.data.mimeType,

        webViewLink:
            uploaded.data.webViewLink ||
            null,

        webContentLink:
            uploaded.data.webContentLink ||
            null

    };

}


// =====================================================
// FOLDER FRAME
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

            supportsAllDrives:
                true,

            includeItemsFromAllDrives:
                true

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

                name:
                    'frame',

                mimeType:
                    'application/vnd.google-apps.folder',

                parents: [
                    GOOGLE_DRIVE_FOLDER_ID
                ]

            },

            fields:
                'id,name',

            supportsAllDrives:
                true

        });


    return folder.data.id;

}


// =====================================================
// FOLDER STICKER
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

            supportsAllDrives:
                true,

            includeItemsFromAllDrives:
                true

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

                name:
                    'sticker',

                mimeType:
                    'application/vnd.google-apps.folder',

                parents: [
                    GOOGLE_DRIVE_FOLDER_ID
                ]

            },

            fields:
                'id,name',

            supportsAllDrives:
                true

        });


    return folder.data.id;

}


// =====================================================
// FRAME CONFIG FILE
// =====================================================

async function getOrCreateFrameConfigFile(
    frameFolderId
) {

    const response =
        await drive.files.list({

            q:
                `name = 'frame-config.json' ` +
                `and '${frameFolderId}' in parents ` +
                `and mimeType = 'application/json' ` +
                `and trashed = false`,

            fields:
                'files(id,name,mimeType,modifiedTime)',

            orderBy:
                'modifiedTime desc',

            pageSize:
                10,

            supportsAllDrives:
                true,

            includeItemsFromAllDrives:
                true

        });


    if (
        response.data.files &&
        response.data.files.length
    ) {

        return response.data.files[0];

    }


    const initialData = {

        version:
            1,

        frames:
            {},

        updatedAt:
            null

    };


    const created =
        await drive.files.create({

            resource: {

                name:
                    'frame-config.json',

                mimeType:
                    'application/json',

                parents: [
                    frameFolderId
                ]

            },

            media: {

                mimeType:
                    'application/json',

                body:
                    stream.Readable.from([

                        JSON.stringify(
                            initialData,
                            null,
                            2
                        )

                    ])

            },

            fields:
                'id,name,mimeType,modifiedTime',

            supportsAllDrives:
                true

        });


    return created.data;

}


// =====================================================
// BACA FRAME CONFIG
// =====================================================

async function readFrameConfigStore() {

    const now =
        Date.now();


    if (

        frameConfigCache &&

        now -
        frameConfigCacheLoadedAt <
        FRAME_CONFIG_CACHE_TTL_MS

    ) {

        return frameConfigCache;

    }


    const frameFolderId =
        await getOrCreateFrameFolder();


    const configFile =
        await getOrCreateFrameConfigFile(
            frameFolderId
        );


    try {

        const response =
            await drive.files.get({

                fileId:
                    configFile.id,

                alt:
                    'media',

                supportsAllDrives:
                    true

            });


        const data =
            response.data &&
            typeof response.data ===
                'object'

                ? response.data

                : {};


        frameConfigCache = {

            version:
                Number(data.version) ||
                1,

            frames:
                data.frames &&
                typeof data.frames ===
                    'object'

                    ? data.frames

                    : {},

            updatedAt:
                data.updatedAt ||
                null

        };

    } catch (error) {

        console.warn(

            '⚠️ frame-config.json belum dapat dibaca:',

            error.message

        );


        frameConfigCache = {

            version:
                1,

            frames:
                {},

            updatedAt:
                null

        };

    }


    frameConfigCacheLoadedAt =
        now;


    return frameConfigCache;

}


// =====================================================
// SIMPAN FRAME CONFIG
// =====================================================

async function writeFrameConfigStore(
    store
) {

    const frameFolderId =
        await getOrCreateFrameFolder();


    const configFile =
        await getOrCreateFrameConfigFile(
            frameFolderId
        );


    const payload = {

        version:
            1,

        frames:
            store.frames &&
            typeof store.frames ===
                'object'

                ? store.frames

                : {},

        updatedAt:
            new Date().toISOString()

    };


    await drive.files.update({

        fileId:
            configFile.id,

        media: {

            mimeType:
                'application/json',

            body:
                stream.Readable.from([

                    JSON.stringify(
                        payload,
                        null,
                        2
                    )

                ])

        },

        fields:
            'id,name,modifiedTime',

        supportsAllDrives:
            true

    });


    frameConfigCache =
        payload;

    frameConfigCacheLoadedAt =
        Date.now();


    return payload;

}


// =====================================================
// NORMALISASI CONFIG FRAME
// =====================================================

function normalizeFrameConfigPayload(
    body
) {

    const framePath =
        String(
            body?.framePath || ''
        ).trim();


    if (
        !framePath ||
        framePath.length > 2000
    ) {

        throw new Error(
            'framePath tidak valid.'
        );

    }


    if (
        !Array.isArray(
            body?.photoMap
        ) ||
        !body.photoMap.length
    ) {

        throw new Error(
            'photoMap tidak valid.'
        );

    }


    const photoMap =
        body.photoMap.map(
            (value, index) => {

                const number =
                    Number.parseInt(
                        value,
                        10
                    );


                if (
                    !Number.isFinite(
                        number
                    ) ||
                    number < 1
                ) {

                    throw new Error(

                        `Nomor foto pada lubang ${index + 1} tidak valid.`

                    );

                }


                return number;

            }
        );


    const colors =
        Array.isArray(
            body.colors
        )

            ? body.colors.map(
                value => {

                    const color =
                        String(
                            value || ''
                        ).trim();


                    return /^#[0-9a-fA-F]{6}$/
                        .test(color)

                        ? color

                        : '#1976d2';

                }
            )

            : [];


    return {

        framePath,

        photoMap,

        colors,

        updatedAt:
            new Date().toISOString()

    };

}


// =====================================================
// ADMIN LOGIN
// =====================================================
//
// INI ENDPOINT YANG DIPANGGIL HTML:
// POST /api/admin/frame-login
//
// =====================================================

app.post(
    '/api/admin/frame-login',
    (req, res) => {

        const {
            username,
            password
        } = req.body || {};


        if (!ADMIN_PASSWORD) {

            return res
                .status(503)
                .json({

                    success:
                        false,

                    message:
                        'ADMIN_PASSWORD belum diatur di environment server.'

                });

        }


        if (
            !isAdminName(username) ||
            String(password || '') !==
                String(ADMIN_PASSWORD)
        ) {

            return res
                .status(403)
                .json({

                    success:
                        false,

                    message:
                        'Username atau password admin salah.'

                });

        }


        const token =
            createAdminToken();


        return res.json({

            success:
                true,

            username:
                ADMIN_USERNAME,

            token,

            expiresIn:
                ADMIN_TOKEN_TTL_MS

        });

    }
);


// =====================================================
// ADMIN LOGOUT
// =====================================================

app.post(
    '/api/admin/frame-logout',
    requireAdmin,
    (req, res) => {

        adminTokens.delete(
            req.adminToken
        );


        res.json({

            success:
                true

        });

    }
);


// =====================================================
// GET FRAME CONFIG
// =====================================================
//
// USER BIASA BOLEH MEMBACA.
//
// HTML MEMANG MEMANGGIL:
//
// /api/frame-config?framePath=...
//
// Saya juga izinkan GET tanpa framePath
// agar endpoint bisa mengembalikan semua konfigurasi.
//
// =====================================================

app.get(
    '/api/frame-config',
    async (req, res) => {

        try {

            const framePath =
                String(
                    req.query.framePath ||
                    ''
                ).trim();


            const store =
                await readFrameConfigStore();


            // -------------------------------------------------
            // JIKA framePath DIKIRIM
            // -------------------------------------------------

            if (framePath) {

                const config =
                    store.frames[
                        framePath
                    ] || null;


                return res.json({

                    success:
                        true,

                    config

                });

            }


            // -------------------------------------------------
            // JIKA TIDAK ADA framePath
            // -------------------------------------------------

            return res.json({

                success:
                    true,

                version:
                    store.version || 1,

                frames:
                    store.frames || {}

            });


        } catch (error) {

            console.error(
                '❌ Error membaca konfigurasi frame:',
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        'Gagal membaca konfigurasi frame.',

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// SAVE FRAME CONFIG
// =====================================================
//
// HANYA CEKREK.
//
// HTML MEMANG MENGIRIM:
//
// POST /api/frame-config
//
// Authorization: Bearer TOKEN
//
// =====================================================

app.post(
    '/api/frame-config',
    requireAdmin,
    async (req, res) => {

        try {

            const config =
                normalizeFrameConfigPayload(
                    req.body || {}
                );


            const store =
                await readFrameConfigStore();


            store.frames[
                config.framePath
            ] = {

                photoMap:
                    config.photoMap,

                colors:
                    config.colors,

                updatedAt:
                    config.updatedAt,

                updatedBy:
                    ADMIN_USERNAME

            };


            const saved =
                await writeFrameConfigStore(
                    store
                );


            res.json({

                success:
                    true,

                config:
                    saved.frames[
                        config.framePath
                    ]

            });


        } catch (error) {

            console.error(
                '❌ Error menyimpan konfigurasi frame:',
                error
            );


            res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        error.message ||
                        'Gagal menyimpan konfigurasi frame.',

                    error:
                        error.message

                });

        }

    }
);


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

                    fileId,

                    fields:
                        'id,name,mimeType,size',

                    supportsAllDrives:
                        true

                });


            const mimeType =
                metadata.data.mimeType;


            if (
                !mimeType ||
                !mimeType.startsWith(
                    'image/'
                )
            ) {

                return res
                    .status(400)
                    .send(
                        'File yang diminta bukan gambar.'
                    );

            }


            const file =
                await drive.files.get(

                    {

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


            res.setHeader(
                'Content-Type',
                mimeType
            );


            res.setHeader(
                'Cache-Control',
                'public, max-age=3600'
            );


            file.data.pipe(res);


        } catch (error) {

            console.error(
                '❌ Error mengambil frame:',
                error
            );


            if (
                !res.headersSent
            ) {

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
// UPLOAD SESSION
// =====================================================

app.post(
    '/upload-session',
    async (req, res) => {

        try {

            const {

                sessionName:
                    clientSessionName,

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

                    .substring(
                        0,
                        80
                    )

                    ||
                    `Sesi_${Date.now()}`;


            const safeDate =
                String(
                    date || ''
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

                    .substring(
                        0,
                        30
                    );


            const sessionName =
                safeDate

                    ? `${safeSessionName}_${safeDate}`

                    : safeSessionName;


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
                        'id,webViewLink',

                    supportsAllDrives:
                        true

                });


            const subFolderId =
                folder.data.id;


            // -------------------------------------------------
            // HASIL FRAME
            // -------------------------------------------------

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

                    i <
                    individualImages.length;

                    i++
                ) {

                    const singleBuffer =
                        Buffer.from(

                            individualImages[i]
                                .replace(
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


            // -------------------------------------------------
            // GIF
            // -------------------------------------------------

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
// UPLOAD FRAME
// =====================================================
//
// HANYA CEKREK.
// HTML SUDAH MENGIRIM Bearer adminToken.
//
// =====================================================

app.post(
    '/upload-frame',
    requireAdmin,
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

                        success:
                            false,

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

                        success:
                            false,

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
                'URL:',
                frameUrl
            );

            console.log(
                '=========================================='
            );


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
                '❌ ERROR UPLOAD FRAME:',
                error
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

                    supportsAllDrives:
                        true,

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


            console.log(
                `📷 ${frames.length} frame ditemukan di Google Drive`
            );


            res.json({

                success:
                    true,

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
// UPLOAD STICKER
// =====================================================
//
// HANYA CEKREK
//
// =====================================================

app.post(
    '/upload-sticker',
    requireAdmin,
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

                        success:
                            false,

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

                        success:
                            false,

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


            const stickerUrl =
                `/frame/${uploaded.id}`;


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
                '❌ ERROR UPLOAD STICKER:',
                error
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

                    supportsAllDrives:
                        true,

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


            console.log(
                `🎨 ${stickers.length} sticker ditemukan di Google Drive`
            );


            res.json({

                success:
                    true,

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
    '/health',
    (req, res) => {

        res.json({

            success:
                true,

            server:
                'online',

            frameConfigAPI:
                'active',

            admin:
                ADMIN_USERNAME

        });

    }
);


// =====================================================
// ROOT
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
            '🔐 Admin Frame: cekrek'
        );

        console.log(
            '⚙️ Frame Configuration API: AKTIF'
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
