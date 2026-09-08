/**
 * QRDetector
 *
 * Locates a QR Code inside a binary image BitMatrix and
 * converts it into a square, perspective-corrected matrix
 * containing one cell per QR module.
 *
 * Pipeline:
 *
 * BitMatrix
 *     ↓
 * FinderPatternFinder
 *     ↓
 * Finder pattern geometry
 *     ↓
 * Estimate module size
 *     ↓
 * Calculate QR dimension/version
 *     ↓
 * Locate alignment pattern when required
 *     ↓
 * Perspective transform
 *     ↓
 * QRGridSampler
 *
 * Requires:
 *
 * - BitMatrix.js
 * - FinderPatternFinder.js
 * - QRGridSampler.js
 */
class QRDetector {

    /**
     * @param {BitMatrix} image
     */
    constructor(image) {

        if (!(image instanceof BitMatrix)) {
            throw new TypeError(
                "QRDetector requires a BitMatrix."
            );
        }

        this.image = image;

        this.width = image.width;
        this.height = image.height;
    }


    /**
     * Detects and samples the QR Code.
     *
     * @returns {{
     *     bits: BitMatrix,
     *     matrix: BitMatrix,
     *     points: Object[],
     *     topLeft: Object,
     *     topRight: Object,
     *     bottomLeft: Object,
     *     alignmentPattern: Object|null,
     *     dimension: number,
     *     moduleSize: number
     * }}
     */
    detect() {

        /*
         * -------------------------------------------------
         * STEP 1
         *
         * Find the three QR finder patterns.
         * -------------------------------------------------
         */
        const finder =
            new FinderPatternFinder(
                this.image
            );


        const finderInfo =
            finder.find();


        if (!finderInfo) {
            throw new Error(
                "QR finder patterns could not be located."
            );
        }


        const topLeft =
            finderInfo.topLeft;

        const topRight =
            finderInfo.topRight;

        const bottomLeft =
            finderInfo.bottomLeft;


        if (
            !topLeft ||
            !topRight ||
            !bottomLeft
        ) {
            throw new Error(
                "QR detector requires three finder patterns."
            );
        }


        /*
         * -------------------------------------------------
         * STEP 2
         *
         * Estimate the physical size of one QR module.
         * -------------------------------------------------
         */
        const moduleSize =
            this.calculateModuleSize(
                topLeft,
                topRight,
                bottomLeft
            );


        if (
            !Number.isFinite(moduleSize) ||
            moduleSize < 1
        ) {
            throw new Error(
                `Invalid QR module size: ${moduleSize}`
            );
        }


        /*
         * -------------------------------------------------
         * STEP 3
         *
         * Calculate the number of modules across the QR.
         * -------------------------------------------------
         */
        const dimension =
            this.computeDimension(
                topLeft,
                topRight,
                bottomLeft,
                moduleSize
            );


        const provisionalVersion =
            Math.floor(
                (
                    dimension -
                    17
                ) /
                4
            );


        if (
            provisionalVersion < 1 ||
            provisionalVersion > 40
        ) {
            throw new Error(
                `Invalid QR version estimate: ${provisionalVersion}`
            );
        }


        /*
         * -------------------------------------------------
         * STEP 4
         *
         * Versions 2+ contain alignment patterns.
         *
         * Search around the estimated bottom-right alignment
         * location.
         * -------------------------------------------------
         */
        let alignmentPattern =
            null;


        if (
            provisionalVersion > 1
        ) {

            const estimatedBottomRight =
                this.estimateBottomRight(
                    topLeft,
                    topRight,
                    bottomLeft
                );


            const modulesBetweenFPCenters =
                dimension - 7;


            /*
             * The final alignment pattern is normally located
             * approximately three modules in from the
             * theoretical bottom-right finder-pattern centre.
             */
            const correctionToTopLeft =
                1.0 -
                (
                    3.0 /
                    modulesBetweenFPCenters
                );


            const estimatedAlignmentX =
                topLeft.x +
                correctionToTopLeft *
                (
                    estimatedBottomRight.x -
                    topLeft.x
                );


            const estimatedAlignmentY =
                topLeft.y +
                correctionToTopLeft *
                (
                    estimatedBottomRight.y -
                    topLeft.y
                );


            /*
             * Try progressively larger search windows.
             *
             * Alignment patterns can be harder to locate
             * than finder patterns because they are only
             * 5×5 modules.
             */
            const searchAllowances =
                [4, 8, 16];


            for (
                let i = 0;
                i <
                    searchAllowances.length;
                i++
            ) {

                try {

                    alignmentPattern =
                        this.findAlignmentPattern(
                            moduleSize,
                            estimatedAlignmentX,
                            estimatedAlignmentY,
                            searchAllowances[i]
                        );


                    if (alignmentPattern) {
                        break;
                    }

                } catch (error) {

                    /*
                     * Failure to locate an alignment pattern
                     * is not immediately fatal.
                     *
                     * The QR can still sometimes be sampled
                     * successfully from the three finder
                     * patterns alone.
                     */
                }
            }
        }


        /*
         * -------------------------------------------------
         * STEP 5
         *
         * Construct the perspective transform.
         * -------------------------------------------------
         */
        const transform =
            this.createTransform(
                topLeft,
                topRight,
                bottomLeft,
                alignmentPattern,
                dimension
            );


        /*
         * -------------------------------------------------
         * STEP 6
         *
         * Sample one image location for each QR module.
         * -------------------------------------------------
         */
        const bits =
            this.sampleGrid(
                dimension,
                transform
            );


        const points = [
            topLeft,
            topRight,
            bottomLeft
        ];


        if (alignmentPattern) {
            points.push(
                alignmentPattern
            );
        }


        return {

            bits:
                bits,

            matrix:
                bits,

            points:
                points,

            topLeft:
                topLeft,

            topRight:
                topRight,

            bottomLeft:
                bottomLeft,

            alignmentPattern:
                alignmentPattern,

            dimension:
                dimension,

            moduleSize:
                moduleSize
        };
    }


    /**
     * Estimates module size using both the horizontal and
     * vertical finder-pattern pairs.
     *
     * @param {Object} topLeft
     * @param {Object} topRight
     * @param {Object} bottomLeft
     *
     * @returns {number}
     */
    calculateModuleSize(
        topLeft,
        topRight,
        bottomLeft
    ) {

        /*
         * First try ZXing-style black/white/black run
         * measurements. These are generally more accurate
         * than simply trusting FinderPatternFinder's module
         * estimates.
         */
        const horizontal =
            this.calculateModuleSizeOneWay(
                topLeft,
                topRight
            );


        const vertical =
            this.calculateModuleSizeOneWay(
                topLeft,
                bottomLeft
            );


        let measuredModuleSize;


        if (
            Number.isFinite(horizontal) &&
            Number.isFinite(vertical)
        ) {

            measuredModuleSize =
                (
                    horizontal +
                    vertical
                ) /
                2.0;

        } else if (
            Number.isFinite(horizontal)
        ) {

            measuredModuleSize =
                horizontal;

        } else if (
            Number.isFinite(vertical)
        ) {

            measuredModuleSize =
                vertical;
        }


        /*
         * FinderPatternFinder already estimates module size
         * from the 1:1:3:1:1 finder ratio.
         *
         * Keep this as a robust fallback.
         */
        const finderEstimate =
            (
                topLeft.estimatedModuleSize +
                topRight.estimatedModuleSize +
                bottomLeft.estimatedModuleSize
            ) /
            3.0;


        if (
            Number.isFinite(measuredModuleSize) &&
            measuredModuleSize > 0
        ) {

            /*
             * If both estimates are reasonable, average them
             * to reduce local thresholding noise.
             */
            if (
                Number.isFinite(finderEstimate) &&
                finderEstimate > 0
            ) {

                const ratio =
                    measuredModuleSize /
                    finderEstimate;


                if (
                    ratio > 0.5 &&
                    ratio < 2.0
                ) {

                    return (
                        measuredModuleSize +
                        finderEstimate
                    ) /
                    2.0;
                }
            }


            return measuredModuleSize;
        }


        if (
            Number.isFinite(finderEstimate) &&
            finderEstimate > 0
        ) {
            return finderEstimate;
        }


        throw new Error(
            "Unable to estimate QR module size."
        );
    }


    /**
     * Calculates module size along one finder-pattern axis.
     *
     * @param {Object} pattern
     * @param {Object} otherPattern
     *
     * @returns {number}
     */
    calculateModuleSizeOneWay(
        pattern,
        otherPattern
    ) {

        const estimate1 =
            this.sizeOfBlackWhiteBlackRunBothWays(
                Math.round(pattern.x),
                Math.round(pattern.y),
                Math.round(otherPattern.x),
                Math.round(otherPattern.y)
            );


        const estimate2 =
            this.sizeOfBlackWhiteBlackRunBothWays(
                Math.round(otherPattern.x),
                Math.round(otherPattern.y),
                Math.round(pattern.x),
                Math.round(pattern.y)
            );


        if (
            Number.isNaN(estimate1)
        ) {

            if (
                Number.isNaN(estimate2)
            ) {
                return NaN;
            }


            return estimate2 / 7.0;
        }


        if (
            Number.isNaN(estimate2)
        ) {

            return estimate1 / 7.0;
        }


        /*
         * Each measurement spans seven finder modules.
         */
        return (
            estimate1 +
            estimate2
        ) /
        14.0;
    }


    /**
     * Measures a black-white-black run in both directions
     * through a finder pattern.
     *
     * @returns {number}
     */
    sizeOfBlackWhiteBlackRunBothWays(
        fromX,
        fromY,
        toX,
        toY
    ) {

        let result =
            this.sizeOfBlackWhiteBlackRun(
                fromX,
                fromY,
                toX,
                toY
            );


        /*
         * Reflect the target through the starting point and
         * measure in the opposite direction.
         */
        let scale = 1.0;


        let otherToX =
            fromX -
            (
                toX -
                fromX
            );


        if (otherToX < 0) {

            scale =
                fromX /
                (
                    fromX -
                    otherToX
                );

            otherToX = 0;

        } else if (
            otherToX >=
            this.width
        ) {

            scale =
                (
                    this.width -
                    1 -
                    fromX
                ) /
                (
                    otherToX -
                    fromX
                );

            otherToX =
                this.width - 1;
        }


        let otherToY =
            Math.floor(
                fromY -
                (
                    toY -
                    fromY
                ) *
                scale
            );


        scale = 1.0;


        if (otherToY < 0) {

            scale =
                fromY /
                (
                    fromY -
                    otherToY
                );

            otherToY = 0;

        } else if (
            otherToY >=
            this.height
        ) {

            scale =
                (
                    this.height -
                    1 -
                    fromY
                ) /
                (
                    otherToY -
                    fromY
                );

            otherToY =
                this.height - 1;
        }


        otherToX =
            Math.floor(
                fromX +
                (
                    otherToX -
                    fromX
                ) *
                scale
            );


        const result2 =
            this.sizeOfBlackWhiteBlackRun(
                fromX,
                fromY,
                otherToX,
                otherToY
            );


        if (
            Number.isNaN(result)
        ) {
            return result2;
        }


        if (
            Number.isNaN(result2)
        ) {
            return result;
        }


        /*
         * Starting pixel is counted in both directions.
         */
        return (
            result +
            result2 -
            1.0
        );
    }


    /**
     * Measures the distance from a finder-pattern centre
     * through:
     *
     * black -> white -> black
     *
     * along a line.
     *
     * Uses a Bresenham-style traversal.
     *
     * @returns {number}
     */
    sizeOfBlackWhiteBlackRun(
        fromX,
        fromY,
        toX,
        toY
    ) {

        let steep =
            Math.abs(
                toY -
                fromY
            ) >
            Math.abs(
                toX -
                fromX
            );


        if (steep) {

            let temp = fromX;
            fromX = fromY;
            fromY = temp;

            temp = toX;
            toX = toY;
            toY = temp;
        }


        const dx =
            Math.abs(
                toX -
                fromX
            );


        const dy =
            Math.abs(
                toY -
                fromY
            );


        let error =
            -dx / 2;


        const xStep =
            fromX <
                toX
                ? 1
                : -1;


        const yStep =
            fromY <
                toY
                ? 1
                : -1;


        let state = 0;

        let x = fromX;
        let y = fromY;


        while (true) {

            const realX =
                steep
                    ? y
                    : x;


            const realY =
                steep
                    ? x
                    : y;


            if (
                realX < 0 ||
                realY < 0 ||
                realX >= this.width ||
                realY >= this.height
            ) {
                break;
            }


            const black =
                this.image.get(
                    realX,
                    realY
                );


            /*
             * Expected sequence from the centre:
             *
             * state 0 = black
             * state 1 = white
             * state 2 = black
             */
            if (
                (
                    state === 1
                ) === black
            ) {

                state++;


                if (state === 3) {

                    const distanceX =
                        x -
                        fromX;

                    const distanceY =
                        y -
                        fromY;


                    return Math.sqrt(
                        distanceX *
                            distanceX +
                        distanceY *
                            distanceY
                    );
                }
            }


            if (x === toX) {
                break;
            }


            error += dy;


            if (error > 0) {

                if (y === toY) {
                    break;
                }


                y += yStep;

                error -= dx;
            }


            x += xStep;
        }


        if (state === 2) {

            const distanceX =
                toX -
                fromX;

            const distanceY =
                toY -
                fromY;


            return Math.sqrt(
                distanceX *
                    distanceX +
                distanceY *
                    distanceY
            );
        }


        return NaN;
    }


    /**
     * Computes QR dimension from finder-pattern distances.
     *
     * @returns {number}
     */
    computeDimension(
        topLeft,
        topRight,
        bottomLeft,
        moduleSize
    ) {

        const topDistance =
            this.distance(
                topLeft,
                topRight
            );


        const leftDistance =
            this.distance(
                topLeft,
                bottomLeft
            );


        const modulesTop =
            Math.round(
                topDistance /
                moduleSize
            );


        const modulesLeft =
            Math.round(
                leftDistance /
                moduleSize
            );


        /*
         * Finder centres are separated by:
         *
         * dimension - 7 modules
         */
        let dimension =
            Math.floor(
                (
                    modulesTop +
                    modulesLeft
                ) /
                2
            ) +
            7;


        /*
         * Valid QR dimensions satisfy:
         *
         * dimension mod 4 = 1
         *
         * Correct small rounding errors in the estimate.
         */
        switch (
            dimension &
            0x03
        ) {

            case 0:

                dimension++;

                break;


            case 2:

                dimension--;

                break;


            case 3:

                /*
                 * Being two modules away from a legal QR
                 * dimension indicates a poor estimate.
                 */
                throw new Error(
                    `Unable to determine valid QR dimension from estimate ${dimension}.`
                );
        }


        if (
            dimension < 21 ||
            dimension > 177
        ) {
            throw new Error(
                `QR dimension out of range: ${dimension}`
            );
        }


        return dimension;
    }


    /**
     * Estimates the theoretical bottom-right finder centre.
     *
     * QR codes do not actually have a bottom-right finder
     * pattern; this point is derived geometrically.
     *
     * @returns {{x:number,y:number}}
     */
    estimateBottomRight(
        topLeft,
        topRight,
        bottomLeft
    ) {

        return {

            x:
                topRight.x +
                bottomLeft.x -
                topLeft.x,

            y:
                topRight.y +
                bottomLeft.y -
                topLeft.y
        };
    }


    /**
     * Searches for the QR alignment pattern near an expected
     * image coordinate.
     *
     * Alignment pattern ratio:
     *
     * black : white : black
     *
     *       1 : 1 : 1
     *
     * The complete alignment target is 5×5 modules.
     *
     * @returns {Object|null}
     */
    findAlignmentPattern(
        overallEstModuleSize,
        estimatedAlignmentX,
        estimatedAlignmentY,
        allowanceFactor
    ) {

        const allowance =
            Math.floor(
                allowanceFactor *
                overallEstModuleSize
            );


        const startX =
            Math.max(
                0,
                Math.floor(
                    estimatedAlignmentX -
                    allowance
                )
            );


        const endX =
            Math.min(
                this.width - 1,
                Math.ceil(
                    estimatedAlignmentX +
                    allowance
                )
            );


        const startY =
            Math.max(
                0,
                Math.floor(
                    estimatedAlignmentY -
                    allowance
                )
            );


        const endY =
            Math.min(
                this.height - 1,
                Math.ceil(
                    estimatedAlignmentY +
                    allowance
                )
            );


        if (
            endX <= startX ||
            endY <= startY
        ) {
            return null;
        }


        const possibleCenters = [];


        /*
         * Scan rows around the estimated centre first.
         *
         * This ordering usually finds the target faster than
         * simply scanning top-to-bottom.
         */
        const middleY =
            Math.floor(
                (
                    startY +
                    endY
                ) /
                2
            );


        const rowCount =
            endY -
            startY +
            1;


        for (
            let rowOffset = 0;
            rowOffset < rowCount;
            rowOffset++
        ) {

            let y;


            if (
                (rowOffset & 1) === 0
            ) {

                y =
                    middleY +
                    Math.floor(
                        (
                            rowOffset +
                            1
                        ) /
                        2
                    );

            } else {

                y =
                    middleY -
                    Math.floor(
                        (
                            rowOffset +
                            1
                        ) /
                        2
                    );
            }


            if (
                y < startY ||
                y > endY
            ) {
                continue;
            }


            const stateCount =
                [0, 0, 0];


            let currentState = 0;


            for (
                let x = startX;
                x <= endX;
                x++
            ) {

                if (
                    this.image.get(
                        x,
                        y
                    )
                ) {

                    /*
                     * Black pixel.
                     */
                    if (
                        currentState === 1
                    ) {

                        currentState++;

                    }

                    stateCount[
                        currentState
                    ]++;

                } else {

                    /*
                     * White pixel.
                     */
                    if (
                        currentState === 1
                    ) {

                        stateCount[1]++;

                    } else if (
                        currentState === 0
                    ) {

                        if (
                            stateCount[0] > 0
                        ) {

                            currentState = 1;

                            stateCount[1]++;
                        }

                    } else {

                        /*
                         * We have black-white-black.
                         */
                        if (
                            this.foundAlignmentPattern(
                                stateCount,
                                overallEstModuleSize
                            )
                        ) {

                            const center =
                                this.handlePossibleAlignmentCenter(
                                    stateCount,
                                    y,
                                    x,
                                    overallEstModuleSize
                                );


                            if (center) {

                                possibleCenters.push(
                                    center
                                );
                            }
                        }


                        /*
                         * Shift the last black run to become
                         * the beginning of the next candidate.
                         */
                        stateCount[0] =
                            stateCount[2];

                        stateCount[1] = 1;
                        stateCount[2] = 0;

                        currentState = 1;
                    }
                }
            }


            if (
                this.foundAlignmentPattern(
                    stateCount,
                    overallEstModuleSize
                )
            ) {

                const center =
                    this.handlePossibleAlignmentCenter(
                        stateCount,
                        y,
                        endX + 1,
                        overallEstModuleSize
                    );


                if (center) {

                    possibleCenters.push(
                        center
                    );
                }
            }
        }


        if (
            possibleCenters.length === 0
        ) {
            return null;
        }


        /*
         * Choose the candidate nearest the expected location
         * while also considering module-size agreement.
         */
        let best = null;
        let bestScore =
            Number.POSITIVE_INFINITY;


        for (
            let i = 0;
            i <
                possibleCenters.length;
            i++
        ) {

            const candidate =
                possibleCenters[i];


            const dx =
                candidate.x -
                estimatedAlignmentX;


            const dy =
                candidate.y -
                estimatedAlignmentY;


            const positionError =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                ) /
                overallEstModuleSize;


            const sizeError =
                Math.abs(
                    candidate.estimatedModuleSize -
                    overallEstModuleSize
                ) /
                overallEstModuleSize;


            const score =
                positionError +
                sizeError * 2;


            if (score < bestScore) {

                bestScore = score;
                best = candidate;
            }
        }


        return best;
    }


    /**
     * Checks whether three runs resemble the centre of an
     * alignment pattern.
     *
     * @returns {boolean}
     */
    foundAlignmentPattern(
        stateCount,
        moduleSize
    ) {

        const maxVariance =
            moduleSize /
            2.0;


        for (
            let i = 0;
            i < 3;
            i++
        ) {

            if (
                stateCount[i] === 0 ||
                Math.abs(
                    stateCount[i] -
                    moduleSize
                ) >
                maxVariance
            ) {
                return false;
            }
        }


        return true;
    }


    /**
     * Cross-checks an alignment-pattern candidate vertically.
     *
     * @returns {Object|null}
     */
    handlePossibleAlignmentCenter(
        stateCount,
        row,
        endX,
        moduleSize
    ) {

        const total =
            stateCount[0] +
            stateCount[1] +
            stateCount[2];


        const centerX =
            endX -
            stateCount[2] -
            stateCount[1] /
            2.0;


        const centerY =
            this.crossCheckAlignmentVertical(
                row,
                Math.floor(
                    centerX
                ),
                2 *
                    stateCount[1],
                total,
                moduleSize
            );


        if (
            Number.isNaN(centerY)
        ) {
            return null;
        }


        return {

            x:
                centerX,

            y:
                centerY,

            estimatedModuleSize:
                total / 3.0,

            count:
                1
        };
    }


    /**
     * Performs a vertical black-white-black alignment check.
     *
     * @returns {number}
     */
    crossCheckAlignmentVertical(
        startY,
        centerX,
        maxCount,
        originalStateCountTotal,
        moduleSize
    ) {

        if (
            centerX < 0 ||
            centerX >= this.width
        ) {
            return NaN;
        }


        const stateCount =
            [0, 0, 0];


        let y = startY;


        /*
         * Central black run upward.
         */
        while (
            y >= 0 &&
            this.image.get(
                centerX,
                y
            ) &&
            stateCount[1] <=
                maxCount
        ) {

            stateCount[1]++;
            y--;
        }


        if (
            y < 0 ||
            stateCount[1] >
                maxCount
        ) {
            return NaN;
        }


        /*
         * White run upward.
         */
        while (
            y >= 0 &&
            !this.image.get(
                centerX,
                y
            ) &&
            stateCount[0] <=
                maxCount
        ) {

            stateCount[0]++;
            y--;
        }


        if (
            stateCount[0] >
            maxCount
        ) {
            return NaN;
        }


        /*
         * Central black run downward.
         */
        y =
            startY + 1;


        while (
            y < this.height &&
            this.image.get(
                centerX,
                y
            ) &&
            stateCount[1] <=
                maxCount
        ) {

            stateCount[1]++;
            y++;
        }


        if (
            y === this.height ||
            stateCount[1] >
                maxCount
        ) {
            return NaN;
        }


        /*
         * White run downward.
         */
        while (
            y < this.height &&
            !this.image.get(
                centerX,
                y
            ) &&
            stateCount[2] <=
                maxCount
        ) {

            stateCount[2]++;
            y++;
        }


        if (
            stateCount[2] >
            maxCount
        ) {
            return NaN;
        }


        const stateCountTotal =
            stateCount[0] +
            stateCount[1] +
            stateCount[2];


        if (
            Math.abs(
                stateCountTotal -
                originalStateCountTotal
            ) >
            originalStateCountTotal
        ) {
            return NaN;
        }


        if (
            !this.foundAlignmentPattern(
                stateCount,
                moduleSize
            )
        ) {
            return NaN;
        }


        return (
            y -
            stateCount[2] -
            stateCount[1] /
            2.0
        );
    }


    /**
     * Creates a projective transform mapping ideal QR module
     * coordinates onto image coordinates.
     *
     * The returned object contains the eight coefficients:
     *
     * x' = (a*x + b*y + c) / (g*x + h*y + 1)
     * y' = (d*x + e*y + f) / (g*x + h*y + 1)
     *
     * @returns {Object}
     */
    createTransform(
        topLeft,
        topRight,
        bottomLeft,
        alignmentPattern,
        dimension
    ) {

        /*
         * Finder pattern centres are located at module
         * coordinate 3.5.
         */
        const sourceTopLeft = {
            x: 3.5,
            y: 3.5
        };


        const sourceTopRight = {
            x:
                dimension -
                3.5,

            y:
                3.5
        };


        const sourceBottomLeft = {
            x:
                3.5,

            y:
                dimension -
                3.5
        };


        let sourceBottomRight;

        let destinationBottomRight;


        if (alignmentPattern) {

            /*
             * Alignment pattern centre corresponds to
             * dimension - 6.5 in ideal module coordinates.
             */
            sourceBottomRight = {
                x:
                    dimension -
                    6.5,

                y:
                    dimension -
                    6.5
            };


            destinationBottomRight = {
                x:
                    alignmentPattern.x,

                y:
                    alignmentPattern.y
            };

        } else {

            /*
             * No alignment pattern available.
             *
             * Estimate the fourth corner using the finder
             * pattern parallelogram.
             */
            sourceBottomRight = {
                x:
                    dimension -
                    3.5,

                y:
                    dimension -
                    3.5
            };


            destinationBottomRight =
                this.estimateBottomRight(
                    topLeft,
                    topRight,
                    bottomLeft
                );
        }


        return this.computePerspectiveTransform(
            sourceTopLeft,
            sourceTopRight,
            sourceBottomRight,
            sourceBottomLeft,

            topLeft,
            topRight,
            destinationBottomRight,
            bottomLeft
        );
    }


    /**
     * Computes a projective transformation between two
     * quadrilaterals.
     *
     * @returns {Object}
     */
    computePerspectiveTransform(
        source0,
        source1,
        source2,
        source3,
        destination0,
        destination1,
        destination2,
        destination3
    ) {

        const sourceToSquare =
            this.quadrilateralToSquare(
                source0,
                source1,
                source2,
                source3
            );


        const squareToDestination =
            this.squareToQuadrilateral(
                destination0,
                destination1,
                destination2,
                destination3
            );


        return this.multiplyTransforms(
            squareToDestination,
            sourceToSquare
        );
    }


    /**
     * Creates a transform from a unit square to a
     * quadrilateral.
     *
     * Matrix representation:
     *
     * [ a b c ]
     * [ d e f ]
     * [ g h 1 ]
     *
     * @returns {Object}
     */
    squareToQuadrilateral(
        p0,
        p1,
        p2,
        p3
    ) {

        const dx3 =
            p0.x -
            p1.x +
            p2.x -
            p3.x;


        const dy3 =
            p0.y -
            p1.y +
            p2.y -
            p3.y;


        if (
            Math.abs(dx3) <
                1e-12 &&
            Math.abs(dy3) <
                1e-12
        ) {

            /*
             * Affine case.
             */
            return {

                a:
                    p1.x -
                    p0.x,

                b:
                    p3.x -
                    p0.x,

                c:
                    p0.x,

                d:
                    p1.y -
                    p0.y,

                e:
                    p3.y -
                    p0.y,

                f:
                    p0.y,

                g:
                    0,

                h:
                    0,

                i:
                    1
            };
        }


        const dx1 =
            p1.x -
            p2.x;


        const dx2 =
            p3.x -
            p2.x;


        const dy1 =
            p1.y -
            p2.y;


        const dy2 =
            p3.y -
            p2.y;


        const denominator =
            dx1 *
                dy2 -
            dx2 *
                dy1;


        if (
            Math.abs(
                denominator
            ) <
            1e-12
        ) {
            throw new Error(
                "Degenerate QR perspective quadrilateral."
            );
        }


        const g =
            (
                dx3 *
                    dy2 -
                dx2 *
                    dy3
            ) /
            denominator;


        const h =
            (
                dx1 *
                    dy3 -
                dx3 *
                    dy1
            ) /
            denominator;


        return {

            a:
                p1.x -
                p0.x +
                g *
                p1.x,

            b:
                p3.x -
                p0.x +
                h *
                p3.x,

            c:
                p0.x,

            d:
                p1.y -
                p0.y +
                g *
                p1.y,

            e:
                p3.y -
                p0.y +
                h *
                p3.y,

            f:
                p0.y,

            g:
                g,

            h:
                h,

            i:
                1
        };
    }


    /**
     * Creates the inverse transform:
     *
     * quadrilateral -> unit square
     *
     * @returns {Object}
     */
    quadrilateralToSquare(
        p0,
        p1,
        p2,
        p3
    ) {

        return this.inverseTransform(
            this.squareToQuadrilateral(
                p0,
                p1,
                p2,
                p3
            )
        );
    }


    /**
     * Inverts a 3×3 perspective transform.
     *
     * @returns {Object}
     */
    inverseTransform(t) {

        const a = t.a;
        const b = t.b;
        const c = t.c;

        const d = t.d;
        const e = t.e;
        const f = t.f;

        const g = t.g;
        const h = t.h;
        const i = t.i;


        const A =
            e * i -
            f * h;

        const B =
            c * h -
            b * i;

        const C =
            b * f -
            c * e;

        const D =
            f * g -
            d * i;

        const E =
            a * i -
            c * g;

        const F =
            c * d -
            a * f;

        const G =
            d * h -
            e * g;

        const H =
            b * g -
            a * h;

        const I =
            a * e -
            b * d;


        const determinant =
            a * A +
            b * D +
            c * G;


        if (
            Math.abs(
                determinant
            ) <
            1e-12
        ) {
            throw new Error(
                "QR perspective transform is singular."
            );
        }


        return {

            a:
                A /
                determinant,

            b:
                B /
                determinant,

            c:
                C /
                determinant,

            d:
                D /
                determinant,

            e:
                E /
                determinant,

            f:
                F /
                determinant,

            g:
                G /
                determinant,

            h:
                H /
                determinant,

            i:
                I /
                determinant
        };
    }


    /**
     * Multiplies two 3×3 transforms.
     *
     * Result = left × right
     *
     * @returns {Object}
     */
    multiplyTransforms(
        left,
        right
    ) {

        return {

            a:
                left.a *
                    right.a +
                left.b *
                    right.d +
                left.c *
                    right.g,

            b:
                left.a *
                    right.b +
                left.b *
                    right.e +
                left.c *
                    right.h,

            c:
                left.a *
                    right.c +
                left.b *
                    right.f +
                left.c *
                    right.i,


            d:
                left.d *
                    right.a +
                left.e *
                    right.d +
                left.f *
                    right.g,

            e:
                left.d *
                    right.b +
                left.e *
                    right.e +
                left.f *
                    right.h,

            f:
                left.d *
                    right.c +
                left.e *
                    right.f +
                left.f *
                    right.i,


            g:
                left.g *
                    right.a +
                left.h *
                    right.d +
                left.i *
                    right.g,

            h:
                left.g *
                    right.b +
                left.h *
                    right.e +
                left.i *
                    right.h,

            i:
                left.g *
                    right.c +
                left.h *
                    right.f +
                left.i *
                    right.i
        };
    }


    /**
     * Applies a perspective transform to one point.
     *
     * @returns {{x:number,y:number}}
     */
    transformPoint(
        transform,
        x,
        y
    ) {

        const denominator =
            transform.g *
                x +
            transform.h *
                y +
            transform.i;


        if (
            Math.abs(
                denominator
            ) <
            1e-12
        ) {
            throw new Error(
                "Invalid QR perspective transform denominator."
            );
        }


        return {

            x:
                (
                    transform.a *
                        x +
                    transform.b *
                        y +
                    transform.c
                ) /
                denominator,

            y:
                (
                    transform.d *
                        x +
                    transform.e *
                        y +
                    transform.f
                ) /
                denominator
        };
    }


    /**
     * Samples the QR grid.
     *
     * If QRGridSampler provides a compatible static method,
     * it is used. Otherwise this detector performs the
     * sampling directly.
     *
     * @returns {BitMatrix}
     */
    sampleGrid(
        dimension,
        transform
    ) {

        /*
         * Preferred project sampler API.
         */
        if (
            typeof QRGridSampler !==
                "undefined" &&
            typeof QRGridSampler
                .sampleGrid ===
                "function"
        ) {

            /*
             * We deliberately pass the transform object.
             * QRGridSampler can use transformPoint() style
             * coefficients directly.
             */
            return QRGridSampler
                .sampleGrid(
                    this.image,
                    dimension,
                    dimension,
                    transform
                );
        }


        /*
         * Fallback sampler.
         *
         * Sampling occurs at module centres:
         *
         * 0.5, 1.5, 2.5 ...
         */
        const result =
            new BitMatrix(
                dimension,
                dimension
            );


        for (
            let y = 0;
            y < dimension;
            y++
        ) {

            for (
                let x = 0;
                x < dimension;
                x++
            ) {

                const point =
                    this.transformPoint(
                        transform,
                        x + 0.5,
                        y + 0.5
                    );


                const checked =
                    this.checkAndNudgePoint(
                        point
                    );


                const imageX =
                    Math.floor(
                        checked.x
                    );


                const imageY =
                    Math.floor(
                        checked.y
                    );


                if (
                    this.image.get(
                        imageX,
                        imageY
                    )
                ) {

                    result.set(
                        x,
                        y
                    );
                }
            }
        }


        return result;
    }


    /**
     * Nudges a transformed point back onto the image when
     * floating-point error places it fractionally outside.
     *
     * @returns {{x:number,y:number}}
     */
    checkAndNudgePoint(point) {

        let x = point.x;
        let y = point.y;


        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y)
        ) {
            throw new Error(
                "QR perspective transform produced an invalid point."
            );
        }


        /*
         * Permit a one-pixel rounding error at each edge.
         */
        if (
            x < -1 ||
            x > this.width ||
            y < -1 ||
            y > this.height
        ) {
            throw new Error(
                "QR perspective transform extends outside the image."
            );
        }


        if (x < 0) {
            x = 0;
        }


        if (
            x >= this.width
        ) {
            x =
                this.width - 1;
        }


        if (y < 0) {
            y = 0;
        }


        if (
            y >= this.height
        ) {
            y =
                this.height - 1;
        }


        return {
            x: x,
            y: y
        };
    }


    /**
     * Euclidean distance between two points.
     *
     * @returns {number}
     */
    distance(a, b) {

        const dx =
            a.x -
            b.x;


        const dy =
            a.y -
            b.y;


        return Math.sqrt(
            dx * dx +
            dy * dy
        );
    }


    /**
     * Returns the source image.
     *
     * @returns {BitMatrix}
     */
    getImage() {

        return this.image;
    }


    /**
     * Returns image width.
     *
     * @returns {number}
     */
    getWidth() {

        return this.width;
    }


    /**
     * Returns image height.
     *
     * @returns {number}
     */
    getHeight() {

        return this.height;
    }
}