/**
 * Grayscale
 *
 * Converts colour image data into grayscale luminance values.
 *
 * Browser Canvas ImageData stores pixels as:
 *
 * R, G, B, A, R, G, B, A, ...
 *
 * This class converts that RGBA representation into one
 * luminance value per pixel:
 *
 * 0   = black
 * 255 = white
 *
 * The resulting Uint8Array can be passed directly to
 * Binarizer.
 */
class Grayscale {

    /**
     * Creates a new Grayscale image.
     *
     * @param {number} width
     * @param {number} height
     * @param {Array<number>|Uint8Array|Uint8ClampedArray} luminance
     */
    constructor(width, height, luminance) {

        if (
            !Number.isInteger(width) ||
            width <= 0
        ) {
            throw new RangeError(
                "Grayscale width must be a positive integer."
            );
        }

        if (
            !Number.isInteger(height) ||
            height <= 0
        ) {
            throw new RangeError(
                "Grayscale height must be a positive integer."
            );
        }

        if (
            !luminance ||
            typeof luminance.length !== "number"
        ) {
            throw new TypeError(
                "Grayscale requires luminance data."
            );
        }

        if (
            luminance.length !==
            width * height
        ) {
            throw new Error(
                "Luminance data length does not match image dimensions."
            );
        }


        this.width = width;
        this.height = height;

        this.luminance =
            luminance instanceof Uint8Array
                ? new Uint8Array(luminance)
                : Uint8Array.from(luminance);
    }


    /**
     * Creates a Grayscale image from browser ImageData.
     *
     * @param {ImageData|Object} imageData
     * @returns {Grayscale}
     */
    static fromImageData(imageData) {

        if (!imageData) {
            throw new TypeError(
                "Grayscale.fromImageData requires ImageData."
            );
        }

        const width =
            imageData.width;

        const height =
            imageData.height;

        const rgba =
            imageData.data;


        if (
            !Number.isInteger(width) ||
            width <= 0 ||
            !Number.isInteger(height) ||
            height <= 0
        ) {
            throw new Error(
                "ImageData has invalid dimensions."
            );
        }


        if (
            !rgba ||
            rgba.length !==
            width * height * 4
        ) {
            throw new Error(
                "ImageData does not contain valid RGBA pixel data."
            );
        }


        return Grayscale.fromRGBA(
            width,
            height,
            rgba
        );
    }


    /**
     * Creates a Grayscale image from an RGBA array.
     *
     * Input:
     *
     * [
     *     R, G, B, A,
     *     R, G, B, A,
     *     ...
     * ]
     *
     * @param {number} width
     * @param {number} height
     * @param {Array<number>|Uint8Array|Uint8ClampedArray} rgba
     * @returns {Grayscale}
     */
    static fromRGBA(
        width,
        height,
        rgba
    ) {

        if (
            !Number.isInteger(width) ||
            width <= 0 ||
            !Number.isInteger(height) ||
            height <= 0
        ) {
            throw new RangeError(
                "Grayscale dimensions must be positive integers."
            );
        }


        if (
            !rgba ||
            typeof rgba.length !== "number"
        ) {
            throw new TypeError(
                "Grayscale.fromRGBA requires RGBA data."
            );
        }


        if (
            rgba.length !==
            width * height * 4
        ) {
            throw new Error(
                "RGBA data length does not match image dimensions."
            );
        }


        const luminance =
            new Uint8Array(
                width * height
            );


        let pixelIndex = 0;


        for (
            let i = 0;
            i < rgba.length;
            i += 4
        ) {

            const red =
                rgba[i];

            const green =
                rgba[i + 1];

            const blue =
                rgba[i + 2];

            const alpha =
                rgba[i + 3];


            /*
             * Calculate perceived luminance.
             *
             * Integer approximation of:
             *
             * Y =
             * 0.299R +
             * 0.587G +
             * 0.114B
             *
             * Using integer arithmetic keeps this fast enough
             * for repeated camera-frame processing.
             */
            let gray =
                (
                    (red * 306) +
                    (green * 601) +
                    (blue * 117) +
                    512
                ) >> 10;


            /*
             * Transparent pixels are blended against white.
             *
             * This is useful for uploaded PNG barcode images
             * with transparent backgrounds.
             */
            if (alpha !== 255) {

                gray =
                    Math.round(
                        (
                            (gray * alpha) +
                            (255 * (255 - alpha))
                        ) /
                        255
                    );
            }


            luminance[
                pixelIndex++
            ] = gray;
        }


        return new Grayscale(
            width,
            height,
            luminance
        );
    }


    /**
     * Creates a Grayscale image from RGB data.
     *
     * Input:
     *
     * [
     *     R, G, B,
     *     R, G, B,
     *     ...
     * ]
     *
     * @param {number} width
     * @param {number} height
     * @param {Array<number>|Uint8Array|Uint8ClampedArray} rgb
     * @returns {Grayscale}
     */
    static fromRGB(
        width,
        height,
        rgb
    ) {

        if (
            !rgb ||
            rgb.length !==
            width * height * 3
        ) {
            throw new Error(
                "RGB data length does not match image dimensions."
            );
        }


        const luminance =
            new Uint8Array(
                width * height
            );


        let pixelIndex = 0;


        for (
            let i = 0;
            i < rgb.length;
            i += 3
        ) {

            luminance[
                pixelIndex++
            ] =
                (
                    (rgb[i] * 306) +
                    (rgb[i + 1] * 601) +
                    (rgb[i + 2] * 117) +
                    512
                ) >> 10;
        }


        return new Grayscale(
            width,
            height,
            luminance
        );
    }


    /**
     * Returns the luminance value at x/y.
     *
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    get(x, y) {

        this.checkCoordinates(
            x,
            y
        );


        return this.luminance[
            (y * this.width) + x
        ];
    }


    /**
     * Sets the luminance value at x/y.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} value
     */
    set(x, y, value) {

        this.checkCoordinates(
            x,
            y
        );


        if (
            !Number.isFinite(value)
        ) {
            throw new TypeError(
                "Grayscale value must be a number."
            );
        }


        value =
            Math.round(value);


        value =
            Math.max(
                0,
                Math.min(
                    255,
                    value
                )
            );


        this.luminance[
            (y * this.width) + x
        ] = value;
    }


    /**
     * Checks a pixel coordinate.
     *
     * @param {number} x
     * @param {number} y
     */
    checkCoordinates(x, y) {

        if (
            !Number.isInteger(x) ||
            !Number.isInteger(y)
        ) {
            throw new TypeError(
                "Grayscale coordinates must be integers."
            );
        }


        if (
            x < 0 ||
            y < 0 ||
            x >= this.width ||
            y >= this.height
        ) {
            throw new RangeError(
                `Grayscale coordinate out of bounds: (${x}, ${y})`
            );
        }
    }


    /**
     * Returns a copy of one row of luminance data.
     *
     * @param {number} y
     * @returns {Uint8Array}
     */
    getRow(y) {

        if (
            !Number.isInteger(y) ||
            y < 0 ||
            y >= this.height
        ) {
            throw new RangeError(
                `Grayscale row out of bounds: ${y}`
            );
        }


        const start =
            y * this.width;


        return this.luminance.slice(
            start,
            start + this.width
        );
    }


    /**
     * Inverts the grayscale image.
     *
     * 0   becomes 255
     * 255 becomes 0
     *
     * @returns {Grayscale}
     */
    invert() {

        const result =
            new Uint8Array(
                this.luminance.length
            );


        for (
            let i = 0;
            i < this.luminance.length;
            i++
        ) {

            result[i] =
                255 -
                this.luminance[i];
        }


        return new Grayscale(
            this.width,
            this.height,
            result
        );
    }


    /**
     * Adjusts image contrast.
     *
     * factor:
     *
     * 1.0 = unchanged
     * >1  = stronger contrast
     * <1  = weaker contrast
     *
     * @param {number} factor
     * @returns {Grayscale}
     */
    adjustContrast(factor) {

        if (
            !Number.isFinite(factor) ||
            factor < 0
        ) {
            throw new RangeError(
                "Contrast factor must be a non-negative number."
            );
        }


        const result =
            new Uint8Array(
                this.luminance.length
            );


        for (
            let i = 0;
            i < this.luminance.length;
            i++
        ) {

            let value =
                (
                    (
                        this.luminance[i] -
                        128
                    ) *
                    factor
                ) +
                128;


            value =
                Math.round(value);


            result[i] =
                Math.max(
                    0,
                    Math.min(
                        255,
                        value
                    )
                );
        }


        return new Grayscale(
            this.width,
            this.height,
            result
        );
    }


    /**
     * Adjusts image brightness.
     *
     * Positive values brighten the image.
     * Negative values darken the image.
     *
     * @param {number} amount
     * @returns {Grayscale}
     */
    adjustBrightness(amount) {

        if (!Number.isFinite(amount)) {
            throw new TypeError(
                "Brightness amount must be a number."
            );
        }


        const result =
            new Uint8Array(
                this.luminance.length
            );


        for (
            let i = 0;
            i < this.luminance.length;
            i++
        ) {

            const value =
                Math.round(
                    this.luminance[i] +
                    amount
                );


            result[i] =
                Math.max(
                    0,
                    Math.min(
                        255,
                        value
                    )
                );
        }


        return new Grayscale(
            this.width,
            this.height,
            result
        );
    }


    /**
     * Returns the average luminance of the image.
     *
     * @returns {number}
     */
    getAverageLuminance() {

        let total = 0;


        for (
            let i = 0;
            i < this.luminance.length;
            i++
        ) {

            total +=
                this.luminance[i];
        }


        return (
            total /
            this.luminance.length
        );
    }


    /**
     * Returns the darkest luminance value.
     *
     * @returns {number}
     */
    getMinimumLuminance() {

        let minimum = 255;


        for (
            let i = 0;
            i < this.luminance.length;
            i++
        ) {

            if (
                this.luminance[i] <
                minimum
            ) {

                minimum =
                    this.luminance[i];
            }
        }


        return minimum;
    }


    /**
     * Returns the brightest luminance value.
     *
     * @returns {number}
     */
    getMaximumLuminance() {

        let maximum = 0;


        for (
            let i = 0;
            i < this.luminance.length;
            i++
        ) {

            if (
                this.luminance[i] >
                maximum
            ) {

                maximum =
                    this.luminance[i];
            }
        }


        return maximum;
    }


    /**
     * Returns the contrast range of the image.
     *
     * @returns {number}
     */
    getDynamicRange() {

        return (
            this.getMaximumLuminance() -
            this.getMinimumLuminance()
        );
    }


    /**
     * Returns a 256-bin luminance histogram.
     *
     * @returns {Uint32Array}
     */
    getHistogram() {

        const histogram =
            new Uint32Array(256);


        for (
            let i = 0;
            i < this.luminance.length;
            i++
        ) {

            histogram[
                this.luminance[i]
            ]++;
        }


        return histogram;
    }


    /**
     * Returns the grayscale data.
     *
     * A copy is returned to prevent accidental modification
     * of the internal image.
     *
     * @returns {Uint8Array}
     */
    getData() {

        return new Uint8Array(
            this.luminance
        );
    }


    /**
     * Alias useful when passing the image directly to
     * Binarizer.
     *
     * @returns {Uint8Array}
     */
    getLuminance() {

        return this.getData();
    }


    /**
     * Returns the width.
     *
     * @returns {number}
     */
    getWidth() {

        return this.width;
    }


    /**
     * Returns the height.
     *
     * @returns {number}
     */
    getHeight() {

        return this.height;
    }


    /**
     * Returns a deep copy.
     *
     * @returns {Grayscale}
     */
    clone() {

        return new Grayscale(
            this.width,
            this.height,
            this.luminance
        );
    }


    /**
     * Converts this grayscale image back into browser
     * ImageData.
     *
     * Useful for displaying/debugging the grayscale stage
     * on a canvas.
     *
     * @returns {ImageData}
     */
    toImageData() {

        if (
            typeof ImageData ===
            "undefined"
        ) {
            throw new Error(
                "ImageData is not available in this environment."
            );
        }


        const rgba =
            new Uint8ClampedArray(
                this.width *
                this.height *
                4
            );


        for (
            let i = 0;
            i < this.luminance.length;
            i++
        ) {

            const gray =
                this.luminance[i];


            const destination =
                i * 4;


            rgba[destination] =
                gray;

            rgba[destination + 1] =
                gray;

            rgba[destination + 2] =
                gray;

            rgba[destination + 3] =
                255;
        }


        return new ImageData(
            rgba,
            this.width,
            this.height
        );
    }
}