/**
 * Binarizer
 *
 * Converts grayscale image data into a binary BitMatrix.
 *
 * Each pixel is classified as either:
 *
 * false = white
 * true  = black
 *
 * Barcode detection works much more reliably on a binary
 * representation than directly on RGB or grayscale pixels.
 *
 * This implementation provides:
 *
 * - Global thresholding
 * - Otsu automatic thresholding
 * - Adaptive/local thresholding
 * - Automatic method selection
 *
 * Requires:
 *
 * - BitMatrix.js
 */
class Binarizer {

    /**
     * Creates a new Binarizer.
     *
     * @param {number} width
     * @param {number} height
     * @param {Array<number>|Uint8Array|Uint8ClampedArray} grayscale
     */
    constructor(width, height, grayscale) {

        if (
            !Number.isInteger(width) ||
            width <= 0
        ) {
            throw new RangeError(
                "Binarizer width must be a positive integer."
            );
        }

        if (
            !Number.isInteger(height) ||
            height <= 0
        ) {
            throw new RangeError(
                "Binarizer height must be a positive integer."
            );
        }

        if (
            !grayscale ||
            typeof grayscale.length !== "number"
        ) {
            throw new TypeError(
                "Binarizer requires grayscale pixel data."
            );
        }

        if (
            grayscale.length !==
            width * height
        ) {
            throw new Error(
                "Grayscale data length does not match image dimensions."
            );
        }


        this.width = width;
        this.height = height;


        /*
         * Store grayscale values as unsigned bytes:
         *
         * 0   = black
         * 255 = white
         */
        this.grayscale =
            grayscale instanceof Uint8Array
                ? grayscale
                : Uint8Array.from(grayscale);
    }


    /**
     * Performs automatic binarization.
     *
     * Small images use Otsu global thresholding.
     * Larger images use adaptive thresholding because
     * photographs often contain uneven lighting.
     *
     * @returns {BitMatrix}
     */
    binarize() {

        /*
         * For very small images there is little benefit
         * in calculating many local regions.
         */
        if (
            this.width < 40 ||
            this.height < 40
        ) {
            return this.binarizeOtsu();
        }


        return this.binarizeAdaptive();
    }


    /**
     * Converts the image using a fixed global threshold.
     *
     * Pixels darker than or equal to the threshold become
     * black modules.
     *
     * @param {number} threshold
     * @returns {BitMatrix}
     */
    binarizeGlobal(threshold = 128) {

        if (
            !Number.isInteger(threshold) ||
            threshold < 0 ||
            threshold > 255
        ) {
            throw new RangeError(
                "Threshold must be an integer between 0 and 255."
            );
        }


        const matrix =
            new BitMatrix(
                this.width,
                this.height
            );


        for (
            let y = 0;
            y < this.height;
            y++
        ) {

            const rowOffset =
                y * this.width;


            for (
                let x = 0;
                x < this.width;
                x++
            ) {

                const luminance =
                    this.grayscale[
                        rowOffset + x
                    ];


                if (luminance <= threshold) {

                    matrix.set(
                        x,
                        y
                    );
                }
            }
        }


        return matrix;
    }


    /**
     * Performs Otsu thresholding.
     *
     * Otsu's method examines the grayscale histogram and
     * automatically selects a threshold that maximises the
     * separation between dark and light pixel classes.
     *
     * @returns {BitMatrix}
     */
    binarizeOtsu() {

        const threshold =
            this.calculateOtsuThreshold();

        return this.binarizeGlobal(
            threshold
        );
    }


    /**
     * Calculates an Otsu threshold from the grayscale image.
     *
     * @returns {number}
     */
    calculateOtsuThreshold() {

        const histogram =
            this.getHistogram();


        const totalPixels =
            this.grayscale.length;


        /*
         * Total weighted intensity.
         */
        let totalIntensity = 0;


        for (
            let i = 0;
            i < 256;
            i++
        ) {

            totalIntensity +=
                i * histogram[i];
        }


        let backgroundWeight = 0;
        let backgroundIntensity = 0;

        let maximumVariance = -1;
        let threshold = 128;


        /*
         * Test every possible threshold and choose the
         * one producing the greatest between-class variance.
         */
        for (
            let i = 0;
            i < 256;
            i++
        ) {

            backgroundWeight +=
                histogram[i];


            /*
             * No pixels currently belong to the
             * background class.
             */
            if (backgroundWeight === 0) {
                continue;
            }


            const foregroundWeight =
                totalPixels -
                backgroundWeight;


            /*
             * All pixels have moved into the background
             * class, so there is nothing left to compare.
             */
            if (foregroundWeight === 0) {
                break;
            }


            backgroundIntensity +=
                i * histogram[i];


            const backgroundMean =
                backgroundIntensity /
                backgroundWeight;


            const foregroundMean =
                (
                    totalIntensity -
                    backgroundIntensity
                ) /
                foregroundWeight;


            const difference =
                backgroundMean -
                foregroundMean;


            const betweenClassVariance =
                backgroundWeight *
                foregroundWeight *
                difference *
                difference;


            if (
                betweenClassVariance >
                maximumVariance
            ) {

                maximumVariance =
                    betweenClassVariance;

                threshold = i;
            }
        }


        return threshold;
    }


    /**
     * Performs adaptive thresholding.
     *
     * The image is split into small blocks. Each block gets
     * its own threshold based on local brightness.
     *
     * This is particularly useful for camera images where
     * one side of a barcode may be brighter than the other.
     *
     * @param {number} blockSize
     * @param {number} minimumDynamicRange
     * @returns {BitMatrix}
     */
    binarizeAdaptive(
        blockSize = 8,
        minimumDynamicRange = 24
    ) {

        if (
            !Number.isInteger(blockSize) ||
            blockSize <= 0
        ) {
            throw new RangeError(
                "Adaptive block size must be a positive integer."
            );
        }


        const blockColumns =
            Math.ceil(
                this.width /
                blockSize
            );


        const blockRows =
            Math.ceil(
                this.height /
                blockSize
            );


        /*
         * Store one estimated black point for every block.
         */
        const blackPoints =
            new Float64Array(
                blockColumns *
                blockRows
            );


        /*
         * --------------------------------------------------
         * STEP 1
         *
         * Calculate a local black point for every block.
         * --------------------------------------------------
         */

        for (
            let blockY = 0;
            blockY < blockRows;
            blockY++
        ) {

            for (
                let blockX = 0;
                blockX < blockColumns;
                blockX++
            ) {

                const startX =
                    blockX * blockSize;

                const startY =
                    blockY * blockSize;


                const endX =
                    Math.min(
                        startX + blockSize,
                        this.width
                    );


                const endY =
                    Math.min(
                        startY + blockSize,
                        this.height
                    );


                let sum = 0;

                let minimum = 255;
                let maximum = 0;

                let pixelCount = 0;


                for (
                    let y = startY;
                    y < endY;
                    y++
                ) {

                    const rowOffset =
                        y * this.width;


                    for (
                        let x = startX;
                        x < endX;
                        x++
                    ) {

                        const value =
                            this.grayscale[
                                rowOffset + x
                            ];


                        sum += value;
                        pixelCount++;


                        if (value < minimum) {
                            minimum = value;
                        }


                        if (value > maximum) {
                            maximum = value;
                        }
                    }
                }


                let blackPoint =
                    sum / pixelCount;


                /*
                 * If there is very little contrast inside
                 * this block, the average is unreliable.
                 *
                 * Bias toward the darkest value instead.
                 */
                if (
                    maximum - minimum <=
                    minimumDynamicRange
                ) {

                    blackPoint =
                        minimum / 2;


                    /*
                     * Use neighbouring blocks to avoid
                     * classifying an evenly lit white area
                     * as black.
                     */
                    if (
                        blockY > 0 &&
                        blockX > 0
                    ) {

                        const above =
                            blackPoints[
                                (blockY - 1) *
                                blockColumns +
                                blockX
                            ];


                        const left =
                            blackPoints[
                                blockY *
                                blockColumns +
                                blockX -
                                1
                            ];


                        const aboveLeft =
                            blackPoints[
                                (blockY - 1) *
                                blockColumns +
                                blockX -
                                1
                            ];


                        const neighbourAverage =
                            (
                                above +
                                (2 * left) +
                                aboveLeft
                            ) / 4;


                        if (
                            minimum <
                            neighbourAverage
                        ) {
                            blackPoint =
                                neighbourAverage;
                        }
                    }
                }


                blackPoints[
                    blockY *
                    blockColumns +
                    blockX
                ] = blackPoint;
            }
        }


        /*
         * --------------------------------------------------
         * STEP 2
         *
         * Threshold every block.
         *
         * Instead of using only the block's own black point,
         * average nearby block values to smooth transitions.
         * --------------------------------------------------
         */

        const matrix =
            new BitMatrix(
                this.width,
                this.height
            );


        for (
            let blockY = 0;
            blockY < blockRows;
            blockY++
        ) {

            for (
                let blockX = 0;
                blockX < blockColumns;
                blockX++
            ) {

                let thresholdSum = 0;
                let thresholdCount = 0;


                /*
                 * Average a 5 × 5 neighbourhood of blocks.
                 */
                for (
                    let neighbourY =
                        Math.max(
                            0,
                            blockY - 2
                        );
                    neighbourY <=
                        Math.min(
                            blockRows - 1,
                            blockY + 2
                        );
                    neighbourY++
                ) {

                    for (
                        let neighbourX =
                            Math.max(
                                0,
                                blockX - 2
                            );
                        neighbourX <=
                            Math.min(
                                blockColumns - 1,
                                blockX + 2
                            );
                        neighbourX++
                    ) {

                        thresholdSum +=
                            blackPoints[
                                neighbourY *
                                blockColumns +
                                neighbourX
                            ];


                        thresholdCount++;
                    }
                }


                const threshold =
                    thresholdSum /
                    thresholdCount;


                const startX =
                    blockX * blockSize;

                const startY =
                    blockY * blockSize;


                const endX =
                    Math.min(
                        startX + blockSize,
                        this.width
                    );


                const endY =
                    Math.min(
                        startY + blockSize,
                        this.height
                    );


                this.thresholdBlock(
                    matrix,
                    startX,
                    startY,
                    endX,
                    endY,
                    threshold
                );
            }
        }


        return matrix;
    }


    /**
     * Applies a threshold to one rectangular image region.
     *
     * @param {BitMatrix} matrix
     * @param {number} startX
     * @param {number} startY
     * @param {number} endX
     * @param {number} endY
     * @param {number} threshold
     */
    thresholdBlock(
        matrix,
        startX,
        startY,
        endX,
        endY,
        threshold
    ) {

        for (
            let y = startY;
            y < endY;
            y++
        ) {

            const rowOffset =
                y * this.width;


            for (
                let x = startX;
                x < endX;
                x++
            ) {

                if (
                    this.grayscale[
                        rowOffset + x
                    ] <= threshold
                ) {

                    matrix.set(
                        x,
                        y
                    );
                }
            }
        }
    }


    /**
     * Builds a 256-entry grayscale histogram.
     *
     * histogram[0]   = number of black pixels
     * histogram[255] = number of white pixels
     *
     * @returns {Uint32Array}
     */
    getHistogram() {

        const histogram =
            new Uint32Array(256);


        for (
            let i = 0;
            i < this.grayscale.length;
            i++
        ) {

            histogram[
                this.grayscale[i]
            ]++;
        }


        return histogram;
    }


    /**
     * Returns the darkest grayscale value in the image.
     *
     * @returns {number}
     */
    getMinimumLuminance() {

        let minimum = 255;


        for (
            let i = 0;
            i < this.grayscale.length;
            i++
        ) {

            if (
                this.grayscale[i] <
                minimum
            ) {

                minimum =
                    this.grayscale[i];
            }
        }


        return minimum;
    }


    /**
     * Returns the brightest grayscale value in the image.
     *
     * @returns {number}
     */
    getMaximumLuminance() {

        let maximum = 0;


        for (
            let i = 0;
            i < this.grayscale.length;
            i++
        ) {

            if (
                this.grayscale[i] >
                maximum
            ) {

                maximum =
                    this.grayscale[i];
            }
        }


        return maximum;
    }


    /**
     * Returns the image contrast range.
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
     * Returns a copy of the grayscale data.
     *
     * @returns {Uint8Array}
     */
    getGrayscale() {

        return new Uint8Array(
            this.grayscale
        );
    }


    /**
     * Returns the image width.
     *
     * @returns {number}
     */
    getWidth() {

        return this.width;
    }


    /**
     * Returns the image height.
     *
     * @returns {number}
     */
    getHeight() {

        return this.height;
    }


    /**
     * Convenience static method.
     *
     * Creates a Binarizer and immediately converts the
     * supplied grayscale image into a BitMatrix.
     *
     * @param {number} width
     * @param {number} height
     * @param {Array<number>|Uint8Array|Uint8ClampedArray} grayscale
     * @returns {BitMatrix}
     */
    static fromGrayscale(
        width,
        height,
        grayscale
    ) {

        return new Binarizer(
            width,
            height,
            grayscale
        ).binarize();
    }
}