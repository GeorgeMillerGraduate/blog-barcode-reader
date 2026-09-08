/**
 * QRCodeReader
 *
 * High-level QR Code reader.
 *
 * Coordinates the complete QR decoding pipeline:
 *
 * BitMatrix containing camera/image pixels
 *      ↓
 * QRDetector
 *      ↓
 * Perspective-corrected QR module matrix
 *      ↓
 * QRBitMatrixParser
 *      ↓
 * Raw codewords
 *      ↓
 * QRDataBlock
 *      ↓
 * QRErrorCorrection
 *      ↓
 * QRDecodedBitStreamParser
 *      ↓
 * Decoded text
 *
 * Requires:
 *
 * - BitMatrix.js
 * - QRDetector.js
 * - QRBitMatrixParser.js
 * - QRDataBlock.js
 * - QRErrorCorrection.js
 * - QRDecodedBitStreamParser.js
 */
class QRCodeReader {

    constructor() {

        this.lastResult = null;
    }


    /**
     * Reads a QR Code from a binary image BitMatrix.
     *
     * @param {BitMatrix} image
     * @returns {Object}
     */
    decode(image) {

        if (!(image instanceof BitMatrix)) {
            throw new TypeError(
                "QRCodeReader.decode requires a BitMatrix."
            );
        }


        this.lastResult = null;


        /*
         * -------------------------------------------------
         * STEP 1
         *
         * Detect the QR Code inside the image.
         * -------------------------------------------------
         */
        const detector =
            new QRDetector(image);


        const detectorResult =
            detector.detect();


        if (!detectorResult) {
            throw new Error(
                "QR Code could not be detected."
            );
        }


        const qrMatrix =
            this.getDetectorMatrix(
                detectorResult
            );


        if (!(qrMatrix instanceof BitMatrix)) {
            throw new Error(
                "QRDetector did not return a valid BitMatrix."
            );
        }


        /*
         * -------------------------------------------------
         * STEP 2
         *
         * Parse structural information and raw codewords.
         * -------------------------------------------------
         */
        const parser =
            new QRBitMatrixParser(
                qrMatrix
            );


        const version =
            parser.readVersion();


        const formatInfo =
            parser.readFormatInformation();


        const rawCodewords =
            parser.readCodewords();


        /*
         * -------------------------------------------------
         * STEP 3
         *
         * Determine the error correction level.
         * -------------------------------------------------
         */
        const errorCorrectionLevel =
            this.getErrorCorrectionLevel(
                formatInfo
            );


        /*
         * -------------------------------------------------
         * STEP 4
         *
         * Split interleaved QR codewords into their
         * Reed-Solomon data blocks.
         * -------------------------------------------------
         */
        const dataBlocks =
            this.getDataBlocks(
                rawCodewords,
                version,
                errorCorrectionLevel
            );


        if (
            !dataBlocks ||
            dataBlocks.length === 0
        ) {
            throw new Error(
                "QR Code contains no data blocks."
            );
        }


        /*
         * Work out how many actual data bytes exist after
         * error-correction bytes are removed.
         */
        let totalDataBytes = 0;


        for (
            let i = 0;
            i < dataBlocks.length;
            i++
        ) {

            totalDataBytes +=
                this.getNumDataCodewords(
                    dataBlocks[i]
                );
        }


        const resultBytes =
            new Uint8Array(
                totalDataBytes
            );


        let resultOffset = 0;


        /*
         * -------------------------------------------------
         * STEP 5
         *
         * Reed-Solomon correct every data block.
         * -------------------------------------------------
         */
        for (
            let i = 0;
            i < dataBlocks.length;
            i++
        ) {

            const block =
                dataBlocks[i];


            const codewords =
                this.getBlockCodewords(
                    block
                );


            const numDataCodewords =
                this.getNumDataCodewords(
                    block
                );


            if (
                numDataCodewords < 0 ||
                numDataCodewords >
                    codewords.length
            ) {
                throw new Error(
                    "QR data block contains an invalid data codeword count."
                );
            }


            /*
             * Error correction operates on the complete
             * block: data + EC codewords.
             */
            this.correctErrors(
                codewords,
                numDataCodewords
            );


            /*
             * Only the data portion is copied into the
             * reconstructed payload stream.
             */
            for (
                let j = 0;
                j < numDataCodewords;
                j++
            ) {

                resultBytes[
                    resultOffset++
                ] =
                    codewords[j];
            }
        }


        /*
         * -------------------------------------------------
         * STEP 6
         *
         * Decode QR modes:
         *
         * numeric
         * alphanumeric
         * byte
         * kanji
         * ECI
         * etc.
         * -------------------------------------------------
         */
        const decoded =
            this.decodeBitStream(
                resultBytes,
                version,
                errorCorrectionLevel
            );


        /*
         * -------------------------------------------------
         * STEP 7
         *
         * Normalize everything into one reader result.
         * -------------------------------------------------
         */
        const result = {

            format:
                "QR_CODE",

            text:
                this.getDecodedText(
                    decoded
                ),

            rawBytes:
                resultBytes,

            version:
                this.getVersionNumber(
                    version
                ),

            errorCorrectionLevel:
                this.getErrorCorrectionLevelName(
                    errorCorrectionLevel
                ),

            dataMask:
                this.getDataMask(
                    formatInfo
                ),

            points:
                this.getDetectorPoints(
                    detectorResult
                ),

            matrix:
                qrMatrix,

            detectorResult:
                detectorResult,

            decoded:
                decoded
        };


        this.lastResult =
            result;


        return result;
    }


    /**
     * Alias for decode().
     *
     * @param {BitMatrix} image
     * @returns {Object}
     */
    read(image) {

        return this.decode(
            image
        );
    }


    /**
     * Attempts to decode without throwing an exception.
     *
     * Useful for live camera scanning where most frames
     * naturally do not contain a readable QR Code.
     *
     * @param {BitMatrix} image
     *
     * @returns {Object|null}
     */
    tryDecode(image) {

        try {

            return this.decode(
                image
            );

        } catch (error) {

            return null;
        }
    }


    /**
     * Decodes a QR Code when the supplied BitMatrix is
     * already a perspective-corrected QR module matrix.
     *
     * This bypasses QRDetector.
     *
     * Useful for testing the decoder independently from
     * camera/image detection.
     *
     * @param {BitMatrix} qrMatrix
     * @returns {Object}
     */
    decodePureMatrix(qrMatrix) {

        if (!(qrMatrix instanceof BitMatrix)) {
            throw new TypeError(
                "decodePureMatrix requires a BitMatrix."
            );
        }


        const parser =
            new QRBitMatrixParser(
                qrMatrix
            );


        const version =
            parser.readVersion();


        const formatInfo =
            parser.readFormatInformation();


        const rawCodewords =
            parser.readCodewords();


        const errorCorrectionLevel =
            this.getErrorCorrectionLevel(
                formatInfo
            );


        const dataBlocks =
            this.getDataBlocks(
                rawCodewords,
                version,
                errorCorrectionLevel
            );


        let totalDataBytes = 0;


        for (
            let i = 0;
            i < dataBlocks.length;
            i++
        ) {

            totalDataBytes +=
                this.getNumDataCodewords(
                    dataBlocks[i]
                );
        }


        const resultBytes =
            new Uint8Array(
                totalDataBytes
            );


        let resultOffset = 0;


        for (
            let i = 0;
            i < dataBlocks.length;
            i++
        ) {

            const block =
                dataBlocks[i];


            const codewords =
                this.getBlockCodewords(
                    block
                );


            const numDataCodewords =
                this.getNumDataCodewords(
                    block
                );


            this.correctErrors(
                codewords,
                numDataCodewords
            );


            for (
                let j = 0;
                j < numDataCodewords;
                j++
            ) {

                resultBytes[
                    resultOffset++
                ] =
                    codewords[j];
            }
        }


        const decoded =
            this.decodeBitStream(
                resultBytes,
                version,
                errorCorrectionLevel
            );


        const result = {

            format:
                "QR_CODE",

            text:
                this.getDecodedText(
                    decoded
                ),

            rawBytes:
                resultBytes,

            version:
                this.getVersionNumber(
                    version
                ),

            errorCorrectionLevel:
                this.getErrorCorrectionLevelName(
                    errorCorrectionLevel
                ),

            dataMask:
                this.getDataMask(
                    formatInfo
                ),

            points:
                [],

            matrix:
                qrMatrix,

            detectorResult:
                null,

            decoded:
                decoded
        };


        this.lastResult =
            result;


        return result;
    }


    /**
     * Performs Reed-Solomon correction on one QR data block.
     *
     * @param {Array<number>|Uint8Array|Int32Array} codewords
     * @param {number} numDataCodewords
     */
    correctErrors(
        codewords,
        numDataCodewords
    ) {

        const numCodewords =
            codewords.length;


        const numECCodewords =
            numCodewords -
            numDataCodewords;


        if (numECCodewords <= 0) {
            return;
        }


        /*
         * Prefer the project's QRErrorCorrection wrapper.
         */
        if (
            typeof QRErrorCorrection !==
            "undefined"
        ) {

            /*
             * Static API.
             */
            if (
                typeof QRErrorCorrection
                    .correctErrors ===
                "function"
            ) {

                const corrected =
                    QRErrorCorrection
                        .correctErrors(
                            codewords,
                            numDataCodewords
                        );


                this.copyCorrectedCodewords(
                    codewords,
                    corrected
                );


                return;
            }


            if (
                typeof QRErrorCorrection
                    .correct ===
                "function"
            ) {

                const corrected =
                    QRErrorCorrection.correct(
                        codewords,
                        numECCodewords
                    );


                this.copyCorrectedCodewords(
                    codewords,
                    corrected
                );


                return;
            }


            /*
             * Instance API.
             */
            try {

                const errorCorrection =
                    new QRErrorCorrection();


                if (
                    typeof errorCorrection
                        .correctErrors ===
                    "function"
                ) {

                    const corrected =
                        errorCorrection
                            .correctErrors(
                                codewords,
                                numDataCodewords
                            );


                    this.copyCorrectedCodewords(
                        codewords,
                        corrected
                    );


                    return;
                }


                if (
                    typeof errorCorrection
                        .correct ===
                    "function"
                ) {

                    const corrected =
                        errorCorrection.correct(
                            codewords,
                            numECCodewords
                        );


                    this.copyCorrectedCodewords(
                        codewords,
                        corrected
                    );


                    return;
                }

            } catch (error) {

                /*
                 * Fall through to the generic Reed-Solomon
                 * decoder below.
                 */
            }
        }


        /*
         * Fallback directly to the generic Reed-Solomon
         * implementation created in js/common/.
         */
        if (
            typeof ReedSolomonDecoder ===
                "undefined" ||
            typeof GenericGF ===
                "undefined"
        ) {
            throw new Error(
                "QR Reed-Solomon error correction is unavailable."
            );
        }


        const field =
            GenericGF
                .QR_CODE_FIELD_256;


        const decoder =
            new ReedSolomonDecoder(
                field
            );


        /*
         * ReedSolomonDecoder works with integer field
         * elements. Use Int32Array during correction.
         */
        const received =
            new Int32Array(
                numCodewords
            );


        for (
            let i = 0;
            i < numCodewords;
            i++
        ) {

            received[i] =
                codewords[i] &
                0xFF;
        }


        decoder.decode(
            received,
            numECCodewords
        );


        /*
         * Copy corrected bytes back into the original block.
         */
        for (
            let i = 0;
            i < numCodewords;
            i++
        ) {

            codewords[i] =
                received[i] &
                0xFF;
        }
    }


    /**
     * Copies corrected data returned by an error-correction
     * implementation back into the original codeword array.
     *
     * Some correction implementations mutate their input
     * and return nothing. Others return a corrected array.
     *
     * @param {*} destination
     * @param {*} corrected
     */
    copyCorrectedCodewords(
        destination,
        corrected
    ) {

        if (
            corrected === undefined ||
            corrected === null ||
            corrected === destination
        ) {
            return;
        }


        if (
            typeof corrected.length !==
            "number"
        ) {
            return;
        }


        const length =
            Math.min(
                destination.length,
                corrected.length
            );


        for (
            let i = 0;
            i < length;
            i++
        ) {

            destination[i] =
                corrected[i] &
                0xFF;
        }
    }


    /**
     * Calls QRDataBlock to de-interleave raw QR codewords.
     *
     * @param {Uint8Array} rawCodewords
     * @param {QRVersion} version
     * @param {*} errorCorrectionLevel
     *
     * @returns {Array}
     */
    getDataBlocks(
        rawCodewords,
        version,
        errorCorrectionLevel
    ) {

        if (
            typeof QRDataBlock ===
            "undefined"
        ) {
            throw new Error(
                "QRDataBlock.js must be loaded before QRCodeReader."
            );
        }


        if (
            typeof QRDataBlock
                .getDataBlocks ===
            "function"
        ) {

            return QRDataBlock
                .getDataBlocks(
                    rawCodewords,
                    version,
                    errorCorrectionLevel
                );
        }


        if (
            typeof QRDataBlock
                .split ===
            "function"
        ) {

            return QRDataBlock.split(
                rawCodewords,
                version,
                errorCorrectionLevel
            );
        }


        try {

            const splitter =
                new QRDataBlock();


            if (
                typeof splitter
                    .getDataBlocks ===
                "function"
            ) {

                return splitter
                    .getDataBlocks(
                        rawCodewords,
                        version,
                        errorCorrectionLevel
                    );
            }


            if (
                typeof splitter
                    .split ===
                "function"
            ) {

                return splitter.split(
                    rawCodewords,
                    version,
                    errorCorrectionLevel
                );
            }

        } catch (error) {

            /*
             * Throw the clearer API error below.
             */
        }


        throw new Error(
            "QRDataBlock must provide getDataBlocks() or split()."
        );
    }


    /**
     * Calls QRDecodedBitStreamParser.
     *
     * @param {Uint8Array} bytes
     * @param {QRVersion} version
     * @param {*} errorCorrectionLevel
     *
     * @returns {*}
     */
    decodeBitStream(
        bytes,
        version,
        errorCorrectionLevel
    ) {

        if (
            typeof QRDecodedBitStreamParser ===
            "undefined"
        ) {
            throw new Error(
                "QRDecodedBitStreamParser.js must be loaded before QRCodeReader."
            );
        }


        if (
            typeof QRDecodedBitStreamParser
                .decode ===
            "function"
        ) {

            return QRDecodedBitStreamParser
                .decode(
                    bytes,
                    version,
                    errorCorrectionLevel
                );
        }


        try {

            const decoder =
                new QRDecodedBitStreamParser();


            if (
                typeof decoder.decode ===
                "function"
            ) {

                return decoder.decode(
                    bytes,
                    version,
                    errorCorrectionLevel
                );
            }

        } catch (error) {

            /*
             * Throw the clearer API error below.
             */
        }


        throw new Error(
            "QRDecodedBitStreamParser must provide decode()."
        );
    }


    /**
     * Extracts the corrected QR matrix from QRDetector.
     *
     * Supports a few common result shapes.
     *
     * @param {*} detectorResult
     * @returns {BitMatrix}
     */
    getDetectorMatrix(
        detectorResult
    ) {

        if (
            detectorResult instanceof
            BitMatrix
        ) {
            return detectorResult;
        }


        if (
            detectorResult.matrix instanceof
            BitMatrix
        ) {
            return detectorResult.matrix;
        }


        if (
            detectorResult.bits instanceof
            BitMatrix
        ) {
            return detectorResult.bits;
        }


        if (
            typeof detectorResult
                .getBits ===
            "function"
        ) {

            return detectorResult
                .getBits();
        }


        if (
            typeof detectorResult
                .getMatrix ===
            "function"
        ) {

            return detectorResult
                .getMatrix();
        }


        throw new Error(
            "Unable to obtain QR matrix from detector result."
        );
    }


    /**
     * Extracts detected QR corner/finder points.
     *
     * @param {*} detectorResult
     * @returns {Array}
     */
    getDetectorPoints(
        detectorResult
    ) {

        if (
            Array.isArray(
                detectorResult.points
            )
        ) {
            return detectorResult
                .points;
        }


        if (
            typeof detectorResult
                .getPoints ===
            "function"
        ) {

            return detectorResult
                .getPoints();
        }


        const points = [];


        if (detectorResult.topLeft) {
            points.push(
                detectorResult.topLeft
            );
        }


        if (detectorResult.topRight) {
            points.push(
                detectorResult.topRight
            );
        }


        if (detectorResult.bottomLeft) {
            points.push(
                detectorResult.bottomLeft
            );
        }


        if (
            detectorResult
                .alignmentPattern
        ) {

            points.push(
                detectorResult
                    .alignmentPattern
            );
        }


        return points;
    }


    /**
     * Returns the number of data codewords in a QRDataBlock.
     *
     * @param {*} block
     * @returns {number}
     */
    getNumDataCodewords(block) {

        if (
            typeof block
                .getNumDataCodewords ===
            "function"
        ) {

            return block
                .getNumDataCodewords();
        }


        if (
            Number.isInteger(
                block.numDataCodewords
            )
        ) {

            return block
                .numDataCodewords;
        }


        if (
            Number.isInteger(
                block.dataCodewords
            )
        ) {

            return block
                .dataCodewords;
        }


        throw new Error(
            "QRDataBlock does not expose numDataCodewords."
        );
    }


    /**
     * Returns a block's codeword array.
     *
     * @param {*} block
     * @returns {Array|Uint8Array|Int32Array}
     */
    getBlockCodewords(block) {

        let codewords;


        if (
            typeof block
                .getCodewords ===
            "function"
        ) {

            codewords =
                block.getCodewords();

        } else {

            codewords =
                block.codewords;
        }


        if (
            !codewords ||
            typeof codewords.length !==
                "number"
        ) {
            throw new Error(
                "QRDataBlock does not expose its codewords."
            );
        }


        return codewords;
    }


    /**
     * Extracts the error correction level from decoded
     * format information.
     *
     * @param {*} formatInfo
     * @returns {*}
     */
    getErrorCorrectionLevel(
        formatInfo
    ) {

        if (
            typeof formatInfo
                .getErrorCorrectionLevel ===
            "function"
        ) {

            return formatInfo
                .getErrorCorrectionLevel();
        }


        if (
            formatInfo
                .errorCorrectionLevel !==
            undefined
        ) {

            return formatInfo
                .errorCorrectionLevel;
        }


        if (
            formatInfo.ecLevel !==
            undefined
        ) {

            return formatInfo
                .ecLevel;
        }


        throw new Error(
            "QR format information does not expose an error correction level."
        );
    }


    /**
     * Returns a readable error correction level.
     *
     * Normally:
     *
     * L
     * M
     * Q
     * H
     *
     * @param {*} level
     * @returns {string}
     */
    getErrorCorrectionLevelName(
        level
    ) {

        if (
            level === null ||
            level === undefined
        ) {
            return "";
        }


        if (
            typeof level ===
            "string"
        ) {
            return level;
        }


        if (
            typeof level
                .getName ===
            "function"
        ) {

            return String(
                level.getName()
            );
        }


        if (
            typeof level.name ===
            "string"
        ) {
            return level.name;
        }


        if (
            typeof level.toString ===
            "function"
        ) {

            return level
                .toString();
        }


        return String(level);
    }


    /**
     * Extracts the QR data mask number.
     *
     * @param {*} formatInfo
     * @returns {number|null}
     */
    getDataMask(formatInfo) {

        if (
            typeof formatInfo
                .getDataMask ===
            "function"
        ) {

            return formatInfo
                .getDataMask();
        }


        if (
            Number.isInteger(
                formatInfo.dataMask
            )
        ) {

            return formatInfo
                .dataMask;
        }


        if (
            Number.isInteger(
                formatInfo.dataMaskReference
            )
        ) {

            return formatInfo
                .dataMaskReference;
        }


        return null;
    }


    /**
     * Returns the QR version number.
     *
     * @param {*} version
     * @returns {number|null}
     */
    getVersionNumber(version) {

        if (
            Number.isInteger(
                version
            )
        ) {
            return version;
        }


        if (
            typeof version
                .getVersionNumber ===
            "function"
        ) {

            return version
                .getVersionNumber();
        }


        if (
            Number.isInteger(
                version.versionNumber
            )
        ) {

            return version
                .versionNumber;
        }


        if (
            Number.isInteger(
                version.version
            )
        ) {

            return version.version;
        }


        return null;
    }


    /**
     * Extracts text from QRDecodedBitStreamParser's result.
     *
     * @param {*} decoded
     * @returns {string}
     */
    getDecodedText(decoded) {

        if (
            decoded === null ||
            decoded === undefined
        ) {
            return "";
        }


        if (
            typeof decoded ===
            "string"
        ) {
            return decoded;
        }


        if (
            typeof decoded
                .getText ===
            "function"
        ) {

            return String(
                decoded.getText()
            );
        }


        if (
            typeof decoded.text ===
            "string"
        ) {

            return decoded.text;
        }


        if (
            typeof decoded.result ===
            "string"
        ) {

            return decoded.result;
        }


        return String(decoded);
    }


    /**
     * Returns the result from the most recent successful
     * decode.
     *
     * @returns {Object|null}
     */
    getLastResult() {

        return this.lastResult;
    }


    /**
     * Clears the cached result.
     */
    reset() {

        this.lastResult =
            null;
    }
}