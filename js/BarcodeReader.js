/**
 * BarcodeReader
 *
 * High-level coordinator for the 2D barcode scanner.
 *
 * AUTO detection order:
 *
 * 1. QR Code
 * 2. Data Matrix
 * 3. Micro QR
 * 4. Aztec
 * 5. PDF417
 * 6. MaxiCode
 *
 * A failed reader does NOT stop automatic detection.
 * BarcodeReader simply moves to the next available reader.
 *
 * Browser-global class.
 */
class BarcodeReader {

    // =========================================================
    // FORMATS
    // =========================================================

    static FORMAT_AUTO = "AUTO";
    static FORMAT_QR_CODE = "QR_CODE";
    static FORMAT_DATA_MATRIX = "DATA_MATRIX";
    static FORMAT_MICRO_QR = "MICRO_QR";
    static FORMAT_AZTEC = "AZTEC";
    static FORMAT_PDF417 = "PDF417";
    static FORMAT_MAXICODE = "MAXICODE";


    // =========================================================
    // CONSTRUCTOR
    // =========================================================

    constructor(options = {}) {

        this.options = {

            format:
                BarcodeReader.FORMAT_AUTO,

            maxWidth:
                null,

            maxHeight:
                null,

            tryInverted:
                true,

            ...options
        };


        this.lastResult = null;
        this.lastError = null;
        this.lastMatrix = null;

        this.imageLoader = null;
    }


    // =========================================================
    // MAIN DECODE
    // =========================================================

    decode(input, format = null) {

        this.lastError = null;


        const selectedFormat =
            this.normaliseFormat(
                format || this.options.format
            );


        const matrix =
            this.inputToBitMatrix(input);


        this.lastMatrix =
            matrix;


        // -----------------------------------------------------
        // NORMAL POLARITY
        // -----------------------------------------------------

        try {

            const result =
                this.decodeMatrix(
                    matrix,
                    selectedFormat
                );


            this.lastResult =
                result;


            return result;

        } catch (normalError) {


            // -------------------------------------------------
            // INVERTED POLARITY
            // -------------------------------------------------

            if (this.options.tryInverted) {

                try {

                    const inverted =
                        this.invertBitMatrix(
                            matrix
                        );


                    const result =
                        this.decodeMatrix(
                            inverted,
                            selectedFormat
                        );


                    result.inverted =
                        true;


                    this.lastMatrix =
                        inverted;


                    this.lastResult =
                        result;


                    return result;

                } catch (invertedError) {

                    normalError.invertedError =
                        invertedError;
                }
            }


            this.lastError =
                normalError;


            throw normalError;
        }
    }


    // =========================================================
    // ALIAS
    // =========================================================

    read(input, format = null) {

        return this.decode(
            input,
            format
        );
    }


    // =========================================================
    // INPUT -> BIT MATRIX
    // =========================================================

    inputToBitMatrix(input) {

        // -----------------------------------------------------
        // BIT MATRIX
        // -----------------------------------------------------

        if (
            typeof BitMatrix !== "undefined" &&
            input instanceof BitMatrix
        ) {

            return input;
        }


        // -----------------------------------------------------
        // IMAGE DATA
        // -----------------------------------------------------

        if (
            typeof ImageData !== "undefined" &&
            input instanceof ImageData
        ) {

            return this.imageDataToBitMatrix(
                input
            );
        }


        // -----------------------------------------------------
        // CANVAS
        // -----------------------------------------------------

        if (
            typeof HTMLCanvasElement !== "undefined" &&
            input instanceof HTMLCanvasElement
        ) {

            return this.canvasToBitMatrix(
                input
            );
        }


        // -----------------------------------------------------
        // IMAGE
        // -----------------------------------------------------

        if (
            typeof HTMLImageElement !== "undefined" &&
            input instanceof HTMLImageElement
        ) {

            return this.imageToBitMatrix(
                input
            );
        }


        // -----------------------------------------------------
        // VIDEO
        // -----------------------------------------------------

        if (
            typeof HTMLVideoElement !== "undefined" &&
            input instanceof HTMLVideoElement
        ) {

            return this.videoToBitMatrix(
                input
            );
        }


        // -----------------------------------------------------
        // FILE / BLOB
        // -----------------------------------------------------

        if (
            typeof Blob !== "undefined" &&
            input instanceof Blob
        ) {

            throw new Error(
                "File/Blob decoding is asynchronous. " +
                "Use BarcodeReader.decodeFile()."
            );
        }


        throw new TypeError(
            "Unsupported BarcodeReader input type."
        );
    }


    // =========================================================
    // DECODE BIT MATRIX
    // =========================================================

    decodeMatrix(
        matrix,
        format = BarcodeReader.FORMAT_AUTO
    ) {

        if (
            typeof BitMatrix === "undefined" ||
            !(matrix instanceof BitMatrix)
        ) {

            throw new TypeError(
                "decodeMatrix requires a BitMatrix."
            );
        }


        const selectedFormat =
            this.normaliseFormat(
                format
            );


        if (
            selectedFormat ===
            BarcodeReader.FORMAT_AUTO
        ) {

            return this.decodeAuto(
                matrix
            );
        }


        return this.decodeWithFormat(
            matrix,
            selectedFormat
        );
    }


    // =========================================================
    // AUTO DETECTION
    // =========================================================

    decodeAuto(matrix) {

        /*
         * IMPORTANT:
         *
         * Every reader gets a chance.
         *
         * A QR failure does NOT terminate scanning.
         *
         * Example:
         *
         * QR fails
         *     ↓
         * Data Matrix attempted
         *     ↓
         * Micro QR attempted
         *     ↓
         * etc.
         */

        const formats = [

            BarcodeReader.FORMAT_QR_CODE,

            BarcodeReader.FORMAT_DATA_MATRIX,

            BarcodeReader.FORMAT_MICRO_QR,

            BarcodeReader.FORMAT_AZTEC,

            BarcodeReader.FORMAT_PDF417,

            BarcodeReader.FORMAT_MAXICODE
        ];


        const errors = [];

        let attempted =
            0;


        for (
            let i = 0;
            i < formats.length;
            i++
        ) {

            const format =
                formats[i];


            // Reader JS file not loaded?
            // Skip it and continue.

            if (
                !this.isReaderAvailable(
                    format
                )
            ) {

                console.debug(
                    `BarcodeReader: ${format} not loaded - skipping.`
                );

                continue;
            }


            attempted++;


            try {

                console.debug(
                    `BarcodeReader: trying ${format}`
                );


                const result =
                    this.decodeWithFormat(
                        matrix,
                        format
                    );


                console.debug(
                    `BarcodeReader: decoded as ${format}`
                );


                return result;

            } catch (error) {

                console.debug(
                    `BarcodeReader: ${format} failed`,
                    error
                );


                errors.push({

                    format:
                        format,

                    error:
                        error
                });


                // IMPORTANT:
                //
                // Do NOT throw here.
                //
                // Continue to next barcode reader.
            }
        }


        if (attempted === 0) {

            throw new Error(
                "No barcode reader classes are loaded."
            );
        }


        const details =
            errors
                .map(entry => {

                    const message =
                        entry.error &&
                        entry.error.message
                            ? entry.error.message
                            : String(
                                entry.error
                            );


                    return (
                        `${entry.format}: ${message}`
                    );
                })
                .join(" | ");


        const error =
            new Error(
                "No supported barcode could be decoded." +
                (
                    details
                        ? " " + details
                        : ""
                )
            );


        error.attempts =
            errors;


        throw error;
    }


    // =========================================================
    // CHECK WHETHER READER EXISTS
    // =========================================================

    isReaderAvailable(format) {

        switch (format) {

            // -------------------------------------------------
            // QR CODE
            // -------------------------------------------------

            case BarcodeReader.FORMAT_QR_CODE:

                return (
                    typeof QRCodeReader !==
                    "undefined"
                );


            // -------------------------------------------------
            // DATA MATRIX
            // -------------------------------------------------

            case BarcodeReader.FORMAT_DATA_MATRIX:

                return (
                    typeof DataMatrixReader !==
                    "undefined"
                );


            // -------------------------------------------------
            // MICRO QR
            // -------------------------------------------------

            case BarcodeReader.FORMAT_MICRO_QR:

                return (
                    typeof MicroQRCodeReader !==
                    "undefined"
                );


            // -------------------------------------------------
            // AZTEC
            // -------------------------------------------------

            case BarcodeReader.FORMAT_AZTEC:

                return (
                    typeof AztecReader !==
                    "undefined"
                );


            // -------------------------------------------------
            // PDF417
            // -------------------------------------------------

            case BarcodeReader.FORMAT_PDF417:

                return (
                    typeof PDF417Reader !==
                    "undefined"
                );


            // -------------------------------------------------
            // MAXICODE
            // -------------------------------------------------

            case BarcodeReader.FORMAT_MAXICODE:

                return (
                    typeof MaxiCodeReader !==
                    "undefined"
                );


            default:

                return false;
        }
    }


    // =========================================================
    // DECODE USING ONE FORMAT
    // =========================================================

    decodeWithFormat(
        matrix,
        format
    ) {

        const reader =
            this.createReader(
                format
            );


        const decoded =
            this.callReader(
                reader,
                matrix
            );


        return this.normaliseResult(
            decoded,
            format
        );
    }


    // =========================================================
    // CREATE FORMAT READER
    // =========================================================

    createReader(format) {

        switch (format) {


            // -------------------------------------------------
            // QR CODE
            // -------------------------------------------------

            case BarcodeReader.FORMAT_QR_CODE:

                if (
                    typeof QRCodeReader ===
                    "undefined"
                ) {

                    throw new Error(
                        "QRCodeReader.js is not loaded."
                    );
                }


                return new QRCodeReader();


            // -------------------------------------------------
            // DATA MATRIX
            // -------------------------------------------------

            case BarcodeReader.FORMAT_DATA_MATRIX:

                if (
                    typeof DataMatrixReader ===
                    "undefined"
                ) {

                    throw new Error(
                        "DataMatrixReader.js is not loaded."
                    );
                }


                return new DataMatrixReader();


            // -------------------------------------------------
            // MICRO QR
            // -------------------------------------------------

            case BarcodeReader.FORMAT_MICRO_QR:

                if (
                    typeof MicroQRCodeReader ===
                    "undefined"
                ) {

                    throw new Error(
                        "MicroQRCodeReader.js is not loaded."
                    );
                }


                return new MicroQRCodeReader();


            // -------------------------------------------------
            // AZTEC
            // -------------------------------------------------

            case BarcodeReader.FORMAT_AZTEC:

                if (
                    typeof AztecReader ===
                    "undefined"
                ) {

                    throw new Error(
                        "AztecReader.js is not loaded."
                    );
                }


                return new AztecReader();


            // -------------------------------------------------
            // PDF417
            // -------------------------------------------------

            case BarcodeReader.FORMAT_PDF417:

                if (
                    typeof PDF417Reader ===
                    "undefined"
                ) {

                    throw new Error(
                        "PDF417Reader.js is not loaded."
                    );
                }


                return new PDF417Reader();


            // -------------------------------------------------
            // MAXICODE
            // -------------------------------------------------

            case BarcodeReader.FORMAT_MAXICODE:

                if (
                    typeof MaxiCodeReader ===
                    "undefined"
                ) {

                    throw new Error(
                        "MaxiCodeReader.js is not loaded."
                    );
                }


                return new MaxiCodeReader();


            default:

                throw new Error(
                    `Unsupported barcode format: ${format}`
                );
        }
    }


    // =========================================================
    // CALL FORMAT READER
    // =========================================================

    callReader(
        reader,
        matrix
    ) {

        if (
            reader &&
            typeof reader.decode ===
                "function"
        ) {

            return reader.decode(
                matrix
            );
        }


        if (
            reader &&
            typeof reader.read ===
                "function"
        ) {

            return reader.read(
                matrix
            );
        }


        throw new Error(
            "Barcode reader does not provide " +
            "decode() or read()."
        );
    }


    // =========================================================
    // AVAILABLE FORMATS
    // =========================================================

    getAvailableFormats() {

        const formats = [

            BarcodeReader.FORMAT_QR_CODE,

            BarcodeReader.FORMAT_DATA_MATRIX,

            BarcodeReader.FORMAT_MICRO_QR,

            BarcodeReader.FORMAT_AZTEC,

            BarcodeReader.FORMAT_PDF417,

            BarcodeReader.FORMAT_MAXICODE
        ];


        return formats.filter(
            format =>
                this.isReaderAvailable(
                    format
                )
        );
    }


    // =========================================================
    // SAFE DECODE
    // =========================================================

    tryDecode(
        input,
        format = null
    ) {

        try {

            return this.decode(
                input,
                format
            );

        } catch (error) {

            this.lastError =
                error;


            return null;
        }
    }


    tryDecodeMatrix(
        matrix,
        format = null
    ) {

        try {

            const result =
                this.decodeMatrix(
                    matrix,
                    format ||
                    this.options.format
                );


            this.lastResult =
                result;


            this.lastMatrix =
                matrix;


            return result;

        } catch (error) {

            this.lastError =
                error;


            return null;
        }
    }


    // =========================================================
    // FILE
    // =========================================================

    async decodeFile(
        file,
        format = null
    ) {

        if (
            typeof Blob === "undefined" ||
            !(file instanceof Blob)
        ) {

            throw new TypeError(
                "decodeFile requires a File or Blob."
            );
        }


        const loader =
            this.getImageLoader();


        try {

            const imageData =
                await loader.loadFile(
                    file,
                    this.options.maxWidth,
                    this.options.maxHeight
                );


            return this.decode(
                imageData,
                format
            );

        } catch (error) {

            this.lastError =
                error;


            throw error;
        }
    }


    async tryDecodeFile(
        file,
        format = null
    ) {

        try {

            return await this.decodeFile(
                file,
                format
            );

        } catch (error) {

            this.lastError =
                error;


            return null;
        }
    }


    // =========================================================
    // URL
    // =========================================================

    async decodeURL(
        url,
        format = null
    ) {

        if (
            typeof url !== "string" ||
            url.length === 0
        ) {

            throw new TypeError(
                "decodeURL requires an image URL."
            );
        }


        const loader =
            this.getImageLoader();


        try {

            const imageData =
                await loader.loadURL(
                    url,
                    this.options.maxWidth,
                    this.options.maxHeight
                );


            return this.decode(
                imageData,
                format
            );

        } catch (error) {

            this.lastError =
                error;


            throw error;
        }
    }


    // =========================================================
    // VIDEO
    // =========================================================

    decodeVideoFrame(
        video,
        format = null
    ) {

        return this.decode(
            video,
            format
        );
    }


    tryDecodeVideoFrame(
        video,
        format = null
    ) {

        return this.tryDecode(
            video,
            format
        );
    }


    // =========================================================
    // IMAGE DATA -> BIT MATRIX
    // =========================================================

    imageDataToBitMatrix(
        imageData
    ) {

        if (
            typeof Grayscale ===
            "undefined"
        ) {

            throw new Error(
                "Grayscale.js must be loaded " +
                "before BarcodeReader."
            );
        }


        if (
            typeof Binarizer ===
            "undefined"
        ) {

            throw new Error(
                "Binarizer.js must be loaded " +
                "before BarcodeReader."
            );
        }


        const grayscale =
            Grayscale.fromImageData(
                imageData
            );


        const binarizer =
            new Binarizer(
                grayscale.getWidth(),
                grayscale.getHeight(),
                grayscale.getData()
            );


        return binarizer.binarize();
    }


    // =========================================================
    // CANVAS -> BIT MATRIX
    // =========================================================

    canvasToBitMatrix(
        canvas
    ) {

        const loader =
            this.getImageLoader();


        const imageData =
            loader.loadCanvas(
                canvas,
                this.options.maxWidth,
                this.options.maxHeight
            );


        return this.imageDataToBitMatrix(
            imageData
        );
    }


    // =========================================================
    // IMAGE -> BIT MATRIX
    // =========================================================

    imageToBitMatrix(
        image
    ) {

        const loader =
            this.getImageLoader();


        const imageData =
            loader.loadImage(
                image,
                this.options.maxWidth,
                this.options.maxHeight
            );


        return this.imageDataToBitMatrix(
            imageData
        );
    }


    // =========================================================
    // VIDEO -> BIT MATRIX
    // =========================================================

    videoToBitMatrix(
        video
    ) {

        const loader =
            this.getImageLoader();


        const imageData =
            loader.loadVideoFrame(
                video,
                this.options.maxWidth,
                this.options.maxHeight
            );


        return this.imageDataToBitMatrix(
            imageData
        );
    }


    // =========================================================
    // FORMAT NORMALISATION
    // =========================================================

    normaliseFormat(format) {

        if (
            format === null ||
            format === undefined ||
            format === ""
        ) {

            return BarcodeReader.FORMAT_AUTO;
        }


        if (
            typeof format !==
            "string"
        ) {

            throw new TypeError(
                "Barcode format must be a string."
            );
        }


        const value =
            format
                .trim()
                .toUpperCase()
                .replace(
                    /[\s-]+/g,
                    "_"
                );


        switch (value) {


            case "AUTO":
            case "AUTOMATIC":

                return BarcodeReader
                    .FORMAT_AUTO;


            case "QR":
            case "QRCODE":
            case "QR_CODE":

                return BarcodeReader
                    .FORMAT_QR_CODE;


            case "DATAMATRIX":
            case "DATA_MATRIX":
            case "DM":

                return BarcodeReader
                    .FORMAT_DATA_MATRIX;


            case "MICROQR":
            case "MICRO_QR":
            case "MICRO_QR_CODE":

                return BarcodeReader
                    .FORMAT_MICRO_QR;


            case "AZTEC":
            case "AZTEC_CODE":

                return BarcodeReader
                    .FORMAT_AZTEC;


            case "PDF417":
            case "PDF_417":

                return BarcodeReader
                    .FORMAT_PDF417;


            case "MAXICODE":
            case "MAXI_CODE":

                return BarcodeReader
                    .FORMAT_MAXICODE;


            default:

                throw new Error(
                    `Unknown barcode format: ${format}`
                );
        }
    }


    // =========================================================
    // NORMALISE RESULT
    // =========================================================

    normaliseResult(
        decoded,
        requestedFormat
    ) {

        if (
            decoded === null ||
            decoded === undefined
        ) {

            throw new Error(
                `${requestedFormat} reader returned no result.`
            );
        }


        // -----------------------------------------------------
        // STRING RESULT
        // -----------------------------------------------------

        if (
            typeof decoded ===
            "string"
        ) {

            return {

                format:
                    requestedFormat,

                text:
                    decoded,

                rawBytes:
                    null,

                points:
                    [],

                inverted:
                    false
            };
        }


        if (
            typeof decoded !==
            "object"
        ) {

            throw new Error(
                `${requestedFormat} reader returned an invalid result.`
            );
        }


        const result = {
            ...decoded
        };


        // -----------------------------------------------------
        // FORMAT
        // -----------------------------------------------------

        if (!result.format) {

            result.format =
                requestedFormat;
        }


        // -----------------------------------------------------
        // TEXT
        // -----------------------------------------------------

        if (
            typeof result.text !==
            "string"
        ) {

            if (
                typeof result.result ===
                "string"
            ) {

                result.text =
                    result.result;

            } else if (
                result.decoded &&
                typeof result.decoded.text ===
                    "string"
            ) {

                result.text =
                    result.decoded.text;

            } else if (
                result.decoded &&
                typeof result.decoded.getText ===
                    "function"
            ) {

                result.text =
                    result.decoded.getText();

            } else {

                result.text =
                    "";
            }
        }


        // -----------------------------------------------------
        // RAW BYTES
        // -----------------------------------------------------

        if (
            result.rawBytes ===
            undefined
        ) {

            result.rawBytes =
                null;
        }


        // -----------------------------------------------------
        // POINTS
        // -----------------------------------------------------

        if (
            !Array.isArray(
                result.points
            )
        ) {

            result.points =
                [];
        }


        // -----------------------------------------------------
        // INVERTED
        // -----------------------------------------------------

        if (
            result.inverted ===
            undefined
        ) {

            result.inverted =
                false;
        }


        return result;
    }


    // =========================================================
    // INVERT BIT MATRIX
    // =========================================================

    invertBitMatrix(
        matrix
    ) {

        if (
            typeof BitMatrix === "undefined" ||
            !(matrix instanceof BitMatrix)
        ) {

            throw new TypeError(
                "invertBitMatrix requires a BitMatrix."
            );
        }


        const inverted =
            new BitMatrix(
                matrix.width,
                matrix.height
            );


        for (
            let y = 0;
            y < matrix.height;
            y++
        ) {

            for (
                let x = 0;
                x < matrix.width;
                x++
            ) {

                if (
                    !matrix.get(
                        x,
                        y
                    )
                ) {

                    inverted.set(
                        x,
                        y
                    );
                }
            }
        }


        return inverted;
    }


    // =========================================================
    // IMAGE LOADER
    // =========================================================

    getImageLoader() {

        if (
            typeof ImageLoader ===
            "undefined"
        ) {

            throw new Error(
                "ImageLoader.js must be loaded " +
                "before BarcodeReader."
            );
        }


        if (
            this.imageLoader ===
            null
        ) {

            this.imageLoader =
                new ImageLoader();
        }


        return this.imageLoader;
    }


    // =========================================================
    // SETTINGS
    // =========================================================

    setFormat(format) {

        this.options.format =
            this.normaliseFormat(
                format
            );


        return this;
    }


    getFormat() {

        return this.normaliseFormat(
            this.options.format
        );
    }


    setTryInverted(enabled) {

        this.options.tryInverted =
            Boolean(enabled);


        return this;
    }


    setMaximumImageSize(
        maxWidth,
        maxHeight
    ) {

        if (
            maxWidth !== null &&
            (
                !Number.isFinite(maxWidth) ||
                maxWidth <= 0
            )
        ) {

            throw new RangeError(
                "maxWidth must be positive or null."
            );
        }


        if (
            maxHeight !== null &&
            (
                !Number.isFinite(maxHeight) ||
                maxHeight <= 0
            )
        ) {

            throw new RangeError(
                "maxHeight must be positive or null."
            );
        }


        this.options.maxWidth =
            maxWidth;


        this.options.maxHeight =
            maxHeight;


        return this;
    }


    // =========================================================
    // STATE
    // =========================================================

    getLastResult() {

        return this.lastResult;
    }


    getLastError() {

        return this.lastError;
    }


    getLastMatrix() {

        return this.lastMatrix;
    }


    reset() {

        this.lastResult =
            null;


        this.lastError =
            null;


        this.lastMatrix =
            null;


        if (
            this.imageLoader &&
            typeof this.imageLoader.clear ===
                "function"
        ) {

            this.imageLoader.clear();
        }
    }
}