/**
 * FinderPatternFinder
 *
 * Searches a binary QR Code image for the three large
 * finder patterns located at:
 *
 * - top-left
 * - top-right
 * - bottom-left
 *
 * A QR finder pattern has the module ratio:
 *
 *     1 : 1 : 3 : 1 : 1
 *
 * representing:
 *
 * black / white / black / white / black
 *
 * This class scans rows of a BitMatrix, identifies candidate
 * 1:1:3:1:1 patterns, cross-checks them vertically and
 * horizontally, combines repeated detections, and selects
 * the best three finder patterns.
 *
 * Requires:
 *
 * - BitMatrix.js
 */
class FinderPatternFinder {

    /**
     * @param {BitMatrix} image
     */
    constructor(image) {

        if (!(image instanceof BitMatrix)) {
            throw new TypeError(
                "FinderPatternFinder requires a BitMatrix."
            );
        }

        this.image = image;

        this.width = image.width;
        this.height = image.height;

        /*
         * Candidate finder patterns discovered while scanning.
         *
         * Each entry:
         *
         * {
         *     x,
         *     y,
         *     estimatedModuleSize,
         *     count
         * }
         */
        this.possibleCenters = [];
    }


    /**
     * Searches the BitMatrix for QR finder patterns.
     *
     * @returns {{
     *     topLeft: Object,
     *     topRight: Object,
     *     bottomLeft: Object,
     *     patterns: Object[]
     * }}
     */
    find() {

        this.possibleCenters = [];

        /*
         * Scan every row.
         *
         * For a first implementation this deliberately scans
         * all rows rather than skipping rows. It costs some
         * performance but makes detection more reliable.
         */
        for (let y = 0; y < this.height; y++) {

            const stateCount =
                [0, 0, 0, 0, 0];

            let currentState = 0;


            for (let x = 0; x < this.width; x++) {

                if (this.image.get(x, y)) {

                    /*
                     * Black pixel.
                     *
                     * Black runs occupy states:
                     *
                     * 0, 2, 4
                     */
                    if ((currentState & 1) === 1) {

                        /*
                         * We were counting white pixels.
                         * Move into the next black state.
                         */
                        currentState++;
                    }

                    stateCount[currentState]++;

                } else {

                    /*
                     * White pixel.
                     *
                     * White runs occupy states:
                     *
                     * 1, 3
                     */
                    if ((currentState & 1) === 0) {

                        /*
                         * We are currently in a black run.
                         */
                        if (currentState === 4) {

                            /*
                             * We have collected five runs.
                             * Check for the 1:1:3:1:1 ratio.
                             */
                            if (
                                this.foundPatternCross(
                                    stateCount
                                )
                            ) {

                                const confirmed =
                                    this.handlePossibleCenter(
                                        stateCount,
                                        y,
                                        x
                                    );


                                if (confirmed) {

                                    /*
                                     * Start again after a
                                     * confirmed candidate.
                                     */
                                    currentState = 0;

                                    stateCount[0] = 0;
                                    stateCount[1] = 0;
                                    stateCount[2] = 0;
                                    stateCount[3] = 0;
                                    stateCount[4] = 0;

                                    continue;
                                }
                            }


                            /*
                             * Shift the last three runs across
                             * and continue searching.
                             *
                             * Previous:
                             *
                             * 0 1 2 3 4
                             *
                             * New:
                             *
                             *     2 3 4
                             *     ↓ ↓ ↓
                             *     0 1 2
                             */
                            stateCount[0] =
                                stateCount[2];

                            stateCount[1] =
                                stateCount[3];

                            stateCount[2] =
                                stateCount[4];

                            stateCount[3] = 1;
                            stateCount[4] = 0;

                            currentState = 3;

                        } else {

                            currentState++;

                            stateCount[
                                currentState
                            ]++;
                        }

                    } else {

                        /*
                         * Continue counting the current
                         * white run.
                         */
                        stateCount[
                            currentState
                        ]++;
                    }
                }
            }


            /*
             * A pattern may end exactly at the right edge
             * of the image.
             */
            if (
                this.foundPatternCross(
                    stateCount
                )
            ) {

                this.handlePossibleCenter(
                    stateCount,
                    y,
                    this.width
                );
            }
        }


        const selected =
            this.selectBestPatterns();


        const ordered =
            this.orderBestPatterns(
                selected
            );


        return {
            topLeft: ordered.topLeft,
            topRight: ordered.topRight,
            bottomLeft: ordered.bottomLeft,
            patterns: [
                ordered.topLeft,
                ordered.topRight,
                ordered.bottomLeft
            ]
        };
    }


    /**
     * Tests whether five run lengths approximately match
     * the QR finder ratio:
     *
     * 1 : 1 : 3 : 1 : 1
     *
     * @param {number[]} stateCount
     * @returns {boolean}
     */
    foundPatternCross(stateCount) {

        let totalModuleSize = 0;


        for (let i = 0; i < 5; i++) {

            if (stateCount[i] === 0) {
                return false;
            }

            totalModuleSize +=
                stateCount[i];
        }


        /*
         * Finder patterns are seven modules wide.
         */
        if (totalModuleSize < 7) {
            return false;
        }


        const moduleSize =
            totalModuleSize / 7.0;


        /*
         * Allow approximately half a module of variance.
         *
         * Real camera images rarely produce exact integer
         * run lengths because of perspective, blur and
         * thresholding.
         */
        const maximumVariance =
            moduleSize / 2.0;


        return (
            Math.abs(
                moduleSize -
                stateCount[0]
            ) < maximumVariance &&

            Math.abs(
                moduleSize -
                stateCount[1]
            ) < maximumVariance &&

            Math.abs(
                (3.0 * moduleSize) -
                stateCount[2]
            ) <
            (3.0 * maximumVariance) &&

            Math.abs(
                moduleSize -
                stateCount[3]
            ) < maximumVariance &&

            Math.abs(
                moduleSize -
                stateCount[4]
            ) < maximumVariance
        );
    }


    /**
     * Calculates the centre coordinate of a detected
     * horizontal 1:1:3:1:1 sequence.
     *
     * @param {number[]} stateCount
     * @param {number} end
     * @returns {number}
     */
    centerFromEnd(
        stateCount,
        end
    ) {

        return (
            end -
            stateCount[4] -
            stateCount[3] -
            (stateCount[2] / 2.0)
        );
    }


    /**
     * Handles a possible horizontal finder pattern.
     *
     * The candidate is cross-checked vertically and
     * horizontally before being accepted.
     *
     * @param {number[]} stateCount
     * @param {number} row
     * @param {number} endX
     * @returns {boolean}
     */
    handlePossibleCenter(
        stateCount,
        row,
        endX
    ) {

        const totalStateCount =
            this.sumCounts(
                stateCount
            );


        const centerX =
            this.centerFromEnd(
                stateCount,
                endX
            );


        const centerXInt =
            Math.floor(centerX);


        if (
            centerXInt < 0 ||
            centerXInt >= this.width
        ) {
            return false;
        }


        /*
         * Confirm the same pattern vertically.
         */
        const centerY =
            this.crossCheckVertical(
                row,
                centerXInt,
                stateCount[2],
                totalStateCount
            );


        if (Number.isNaN(centerY)) {
            return false;
        }


        const centerYInt =
            Math.floor(centerY);


        /*
         * Confirm it horizontally again around the
         * calculated centre.
         */
        const refinedCenterX =
            this.crossCheckHorizontal(
                centerXInt,
                centerYInt,
                stateCount[2],
                totalStateCount
            );


        if (
            Number.isNaN(
                refinedCenterX
            )
        ) {
            return false;
        }


        /*
         * A finder pattern should also contain black pixels
         * along both diagonals through the central region.
         *
         * This is a lightweight additional rejection test
         * for random line patterns.
         */
        if (
            !this.crossCheckDiagonal(
                centerYInt,
                Math.floor(
                    refinedCenterX
                ),
                stateCount[2],
                totalStateCount
            )
        ) {
            return false;
        }


        const estimatedModuleSize =
            totalStateCount / 7.0;


        /*
         * If this location is close to an existing candidate,
         * merge the observations rather than adding another
         * finder pattern.
         */
        for (
            let i = 0;
            i < this.possibleCenters.length;
            i++
        ) {

            const center =
                this.possibleCenters[i];


            if (
                this.aboutEquals(
                    center,
                    estimatedModuleSize,
                    centerY,
                    refinedCenterX
                )
            ) {

                this.possibleCenters[i] =
                    this.combineEstimate(
                        center,
                        centerY,
                        refinedCenterX,
                        estimatedModuleSize
                    );

                return true;
            }
        }


        /*
         * New candidate.
         */
        this.possibleCenters.push({
            x: refinedCenterX,
            y: centerY,
            estimatedModuleSize:
                estimatedModuleSize,
            count: 1
        });


        return true;
    }


    /**
     * Cross-checks a possible finder pattern vertically.
     *
     * Starting at the estimated centre, count:
     *
     * black
     * white
     * black
     * white
     * black
     *
     * vertically and verify the same 1:1:3:1:1 ratio.
     *
     * @param {number} startY
     * @param {number} centerX
     * @param {number} maxCount
     * @param {number} originalStateCountTotal
     *
     * @returns {number}
     */
    crossCheckVertical(
        startY,
        centerX,
        maxCount,
        originalStateCountTotal
    ) {

        const maxY =
            this.height;


        const stateCount =
            [0, 0, 0, 0, 0];


        let y = startY;


        /*
         * Count central black run upward.
         */
        while (
            y >= 0 &&
            this.image.get(
                centerX,
                y
            )
        ) {

            stateCount[2]++;
            y--;
        }


        if (y < 0) {
            return NaN;
        }


        /*
         * Count white run upward.
         */
        while (
            y >= 0 &&
            !this.image.get(
                centerX,
                y
            ) &&
            stateCount[1] <= maxCount
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
         * Count outer black run upward.
         */
        while (
            y >= 0 &&
            this.image.get(
                centerX,
                y
            ) &&
            stateCount[0] <= maxCount
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
         * Count central black run downward.
         *
         * startY itself was already counted above.
         */
        y =
            startY + 1;


        while (
            y < maxY &&
            this.image.get(
                centerX,
                y
            )
        ) {

            stateCount[2]++;
            y++;
        }


        if (y === maxY) {
            return NaN;
        }


        /*
         * Count white run downward.
         */
        while (
            y < maxY &&
            !this.image.get(
                centerX,
                y
            ) &&
            stateCount[3] < maxCount
        ) {

            stateCount[3]++;
            y++;
        }


        if (
            y === maxY ||
            stateCount[3] >=
                maxCount
        ) {
            return NaN;
        }


        /*
         * Count outer black run downward.
         */
        while (
            y < maxY &&
            this.image.get(
                centerX,
                y
            ) &&
            stateCount[4] < maxCount
        ) {

            stateCount[4]++;
            y++;
        }


        if (
            stateCount[4] >=
            maxCount
        ) {
            return NaN;
        }


        const stateCountTotal =
            this.sumCounts(
                stateCount
            );


        /*
         * Reject if the vertical size is substantially
         * different from the horizontal observation.
         */
        if (
            5 *
            Math.abs(
                stateCountTotal -
                originalStateCountTotal
            ) >=
            2 *
            originalStateCountTotal
        ) {
            return NaN;
        }


        if (
            !this.foundPatternCross(
                stateCount
            )
        ) {
            return NaN;
        }


        return this.centerFromEnd(
            stateCount,
            y
        );
    }


    /**
     * Cross-checks a possible finder pattern horizontally.
     *
     * @param {number} startX
     * @param {number} centerY
     * @param {number} maxCount
     * @param {number} originalStateCountTotal
     *
     * @returns {number}
     */
    crossCheckHorizontal(
        startX,
        centerY,
        maxCount,
        originalStateCountTotal
    ) {

        const maxX =
            this.width;


        const stateCount =
            [0, 0, 0, 0, 0];


        let x = startX;


        /*
         * Central black run left.
         */
        while (
            x >= 0 &&
            this.image.get(
                x,
                centerY
            )
        ) {

            stateCount[2]++;
            x--;
        }


        if (x < 0) {
            return NaN;
        }


        /*
         * White run left.
         */
        while (
            x >= 0 &&
            !this.image.get(
                x,
                centerY
            ) &&
            stateCount[1] <= maxCount
        ) {

            stateCount[1]++;
            x--;
        }


        if (
            x < 0 ||
            stateCount[1] >
                maxCount
        ) {
            return NaN;
        }


        /*
         * Outer black run left.
         */
        while (
            x >= 0 &&
            this.image.get(
                x,
                centerY
            ) &&
            stateCount[0] <= maxCount
        ) {

            stateCount[0]++;
            x--;
        }


        if (
            stateCount[0] >
            maxCount
        ) {
            return NaN;
        }


        /*
         * Central black run right.
         */
        x =
            startX + 1;


        while (
            x < maxX &&
            this.image.get(
                x,
                centerY
            )
        ) {

            stateCount[2]++;
            x++;
        }


        if (x === maxX) {
            return NaN;
        }


        /*
         * White run right.
         */
        while (
            x < maxX &&
            !this.image.get(
                x,
                centerY
            ) &&
            stateCount[3] < maxCount
        ) {

            stateCount[3]++;
            x++;
        }


        if (
            x === maxX ||
            stateCount[3] >=
                maxCount
        ) {
            return NaN;
        }


        /*
         * Outer black run right.
         */
        while (
            x < maxX &&
            this.image.get(
                x,
                centerY
            ) &&
            stateCount[4] < maxCount
        ) {

            stateCount[4]++;
            x++;
        }


        if (
            stateCount[4] >=
            maxCount
        ) {
            return NaN;
        }


        const stateCountTotal =
            this.sumCounts(
                stateCount
            );


        if (
            5 *
            Math.abs(
                stateCountTotal -
                originalStateCountTotal
            ) >=
            originalStateCountTotal
        ) {
            return NaN;
        }


        if (
            !this.foundPatternCross(
                stateCount
            )
        ) {
            return NaN;
        }


        return this.centerFromEnd(
            stateCount,
            x
        );
    }


    /**
     * Performs a lightweight diagonal verification.
     *
     * This helps reject ordinary horizontal/vertical line
     * structures that accidentally resemble 1:1:3:1:1.
     *
     * @param {number} centerY
     * @param {number} centerX
     * @param {number} maxCount
     * @param {number} originalStateCountTotal
     *
     * @returns {boolean}
     */
    crossCheckDiagonal(
        centerY,
        centerX,
        maxCount,
        originalStateCountTotal
    ) {

        const stateCount =
            [0, 0, 0, 0, 0];


        let x = centerX;
        let y = centerY;


        /*
         * Central black run towards upper-left.
         */
        while (
            x >= 0 &&
            y >= 0 &&
            this.image.get(x, y)
        ) {

            stateCount[2]++;
            x--;
            y--;
        }


        if (
            x < 0 ||
            y < 0
        ) {
            return false;
        }


        /*
         * White run upper-left.
         */
        while (
            x >= 0 &&
            y >= 0 &&
            !this.image.get(x, y) &&
            stateCount[1] <= maxCount
        ) {

            stateCount[1]++;
            x--;
            y--;
        }


        if (
            x < 0 ||
            y < 0 ||
            stateCount[1] >
                maxCount
        ) {
            return false;
        }


        /*
         * Outer black run upper-left.
         */
        while (
            x >= 0 &&
            y >= 0 &&
            this.image.get(x, y) &&
            stateCount[0] <= maxCount
        ) {

            stateCount[0]++;
            x--;
            y--;
        }


        if (
            stateCount[0] >
            maxCount
        ) {
            return false;
        }


        /*
         * Central black run towards lower-right.
         */
        x =
            centerX + 1;

        y =
            centerY + 1;


        while (
            x < this.width &&
            y < this.height &&
            this.image.get(x, y)
        ) {

            stateCount[2]++;
            x++;
            y++;
        }


        if (
            x >= this.width ||
            y >= this.height
        ) {
            return false;
        }


        /*
         * White run lower-right.
         */
        while (
            x < this.width &&
            y < this.height &&
            !this.image.get(x, y) &&
            stateCount[3] < maxCount
        ) {

            stateCount[3]++;
            x++;
            y++;
        }


        if (
            x >= this.width ||
            y >= this.height ||
            stateCount[3] >=
                maxCount
        ) {
            return false;
        }


        /*
         * Outer black run lower-right.
         */
        while (
            x < this.width &&
            y < this.height &&
            this.image.get(x, y) &&
            stateCount[4] < maxCount
        ) {

            stateCount[4]++;
            x++;
            y++;
        }


        if (
            stateCount[4] >=
            maxCount
        ) {
            return false;
        }


        const total =
            this.sumCounts(
                stateCount
            );


        /*
         * Diagonal distances are affected by sqrt(2), so
         * use a looser size comparison than the horizontal
         * and vertical cross-checks.
         */
        if (
            Math.abs(
                total -
                originalStateCountTotal
            ) >
            originalStateCountTotal
        ) {
            return false;
        }


        return this.foundPatternCross(
            stateCount
        );
    }


    /**
     * Determines whether a new finder observation is close
     * enough to an existing candidate to represent the same
     * finder pattern.
     *
     * @param {Object} center
     * @param {number} moduleSize
     * @param {number} y
     * @param {number} x
     *
     * @returns {boolean}
     */
    aboutEquals(
        center,
        moduleSize,
        y,
        x
    ) {

        if (
            Math.abs(
                y - center.y
            ) > moduleSize ||
            Math.abs(
                x - center.x
            ) > moduleSize
        ) {
            return false;
        }


        const moduleSizeDifference =
            Math.abs(
                moduleSize -
                center.estimatedModuleSize
            );


        return (
            moduleSizeDifference <= 1.0 ||
            moduleSizeDifference <=
                center.estimatedModuleSize
        );
    }


    /**
     * Combines a new observation with an existing finder
     * pattern estimate.
     *
     * @param {Object} center
     * @param {number} y
     * @param {number} x
     * @param {number} moduleSize
     *
     * @returns {Object}
     */
    combineEstimate(
        center,
        y,
        x,
        moduleSize
    ) {

        const combinedCount =
            center.count + 1;


        return {
            x:
                (
                    center.count *
                    center.x +
                    x
                ) /
                combinedCount,

            y:
                (
                    center.count *
                    center.y +
                    y
                ) /
                combinedCount,

            estimatedModuleSize:
                (
                    center.count *
                    center.estimatedModuleSize +
                    moduleSize
                ) /
                combinedCount,

            count:
                combinedCount
        };
    }


    /**
     * Selects the three most plausible finder patterns.
     *
     * Candidate triples are scored using:
     *
     * - similar module sizes
     * - approximately equal top/left side lengths
     * - approximately perpendicular sides
     * - approximately correct diagonal length
     * - repeated observations
     *
     * @returns {Object[]}
     */
    selectBestPatterns() {

        if (
            this.possibleCenters.length < 3
        ) {
            throw new Error(
                "QR finder patterns not found."
            );
        }


        /*
         * Remove extremely weak candidates where possible.
         *
         * Keep single-observation candidates too because a
         * small or low-resolution QR may only produce one
         * clean scan line through a finder.
         */
        const candidates =
            this.possibleCenters.slice();


        let bestTriple = null;
        let bestScore =
            Number.POSITIVE_INFINITY;


        /*
         * Test every candidate combination.
         *
         * Finder counts are normally small, so exhaustive
         * triple selection is acceptable and much safer than
         * simply choosing the first three detections.
         */
        for (
            let i = 0;
            i <
            candidates.length - 2;
            i++
        ) {

            for (
                let j = i + 1;
                j <
                candidates.length - 1;
                j++
            ) {

                for (
                    let k = j + 1;
                    k <
                    candidates.length;
                    k++
                ) {

                    const triple = [
                        candidates[i],
                        candidates[j],
                        candidates[k]
                    ];


                    const score =
                        this.scorePatternTriple(
                            triple
                        );


                    if (
                        score <
                        bestScore
                    ) {

                        bestScore =
                            score;

                        bestTriple =
                            triple;
                    }
                }
            }
        }


        if (!bestTriple) {
            throw new Error(
                "Unable to select three QR finder patterns."
            );
        }


        return bestTriple;
    }


    /**
     * Scores three finder pattern candidates.
     *
     * Lower scores are better.
     *
     * @param {Object[]} patterns
     * @returns {number}
     */
    scorePatternTriple(patterns) {

        const a =
            patterns[0];

        const b =
            patterns[1];

        const c =
            patterns[2];


        /*
         * Finder patterns should have very similar
         * estimated module sizes.
         */
        const averageModuleSize =
            (
                a.estimatedModuleSize +
                b.estimatedModuleSize +
                c.estimatedModuleSize
            ) / 3.0;


        if (averageModuleSize <= 0) {
            return Number.POSITIVE_INFINITY;
        }


        const moduleVariation =
            (
                Math.abs(
                    a.estimatedModuleSize -
                    averageModuleSize
                ) +
                Math.abs(
                    b.estimatedModuleSize -
                    averageModuleSize
                ) +
                Math.abs(
                    c.estimatedModuleSize -
                    averageModuleSize
                )
            ) /
            averageModuleSize;


        /*
         * Determine which point is most likely the
         * top-left corner.
         *
         * In the finder triangle, top-left is opposite the
         * longest side (top-right ↔ bottom-left).
         */
        const ab =
            this.distanceSquared(
                a,
                b
            );

        const bc =
            this.distanceSquared(
                b,
                c
            );

        const ac =
            this.distanceSquared(
                a,
                c
            );


        let topLeft;
        let point1;
        let point2;
        let longest;


        if (
            bc >= ab &&
            bc >= ac
        ) {

            topLeft = a;
            point1 = b;
            point2 = c;
            longest = bc;

        } else if (
            ac >= ab &&
            ac >= bc
        ) {

            topLeft = b;
            point1 = a;
            point2 = c;
            longest = ac;

        } else {

            topLeft = c;
            point1 = a;
            point2 = b;
            longest = ab;
        }


        const side1 =
            this.distanceSquared(
                topLeft,
                point1
            );


        const side2 =
            this.distanceSquared(
                topLeft,
                point2
            );


        if (
            side1 <= 0 ||
            side2 <= 0 ||
            longest <= 0
        ) {
            return Number.POSITIVE_INFINITY;
        }


        /*
         * QR top and left sides should be approximately
         * equal in length.
         */
        const sideBalance =
            Math.abs(
                side1 -
                side2
            ) /
            Math.max(
                side1,
                side2
            );


        /*
         * Pythagorean relationship:
         *
         * diagonal² ≈ side1² + side2²
         *
         * Here our distances are already squared, so:
         *
         * longest ≈ side1 + side2
         */
        const rightAngleError =
            Math.abs(
                longest -
                (
                    side1 +
                    side2
                )
            ) /
            longest;


        /*
         * Explicit dot-product test for perpendicularity.
         */
        const vector1X =
            point1.x -
            topLeft.x;

        const vector1Y =
            point1.y -
            topLeft.y;


        const vector2X =
            point2.x -
            topLeft.x;

        const vector2Y =
            point2.y -
            topLeft.y;


        const dot =
            Math.abs(
                vector1X *
                vector2X +
                vector1Y *
                vector2Y
            );


        const vectorMagnitude =
            Math.sqrt(
                side1 *
                side2
            );


        const perpendicularError =
            vectorMagnitude === 0
                ? 1
                : dot /
                  vectorMagnitude;


        /*
         * Repeated observations improve confidence.
         */
        const observationCount =
            a.count +
            b.count +
            c.count;


        const observationBonus =
            1 /
            Math.max(
                1,
                observationCount
            );


        /*
         * Reject wildly inconsistent geometry.
         */
        if (
            sideBalance > 0.8 ||
            rightAngleError > 0.8 ||
            perpendicularError > 0.8 ||
            moduleVariation > 2.0
        ) {
            return (
                1000 +
                sideBalance +
                rightAngleError +
                perpendicularError +
                moduleVariation
            );
        }


        return (
            moduleVariation * 3 +
            sideBalance * 4 +
            rightAngleError * 4 +
            perpendicularError * 4 +
            observationBonus
        );
    }


    /**
     * Orders three selected finder patterns into:
     *
     * topLeft
     * topRight
     * bottomLeft
     *
     * This works using geometry rather than assuming the
     * QR code is upright in the image.
     *
     * @param {Object[]} patterns
     *
     * @returns {{
     *     topLeft:Object,
     *     topRight:Object,
     *     bottomLeft:Object
     * }}
     */
    orderBestPatterns(patterns) {

        if (
            !patterns ||
            patterns.length !== 3
        ) {
            throw new Error(
                "Exactly three finder patterns are required."
            );
        }


        const p0 =
            patterns[0];

        const p1 =
            patterns[1];

        const p2 =
            patterns[2];


        const d01 =
            this.distanceSquared(
                p0,
                p1
            );

        const d12 =
            this.distanceSquared(
                p1,
                p2
            );

        const d02 =
            this.distanceSquared(
                p0,
                p2
            );


        /*
         * The longest distance is between top-right and
         * bottom-left.
         *
         * The remaining point is top-left.
         */
        let topLeft;
        let pointA;
        let pointB;


        if (
            d12 >= d01 &&
            d12 >= d02
        ) {

            topLeft = p0;
            pointA = p1;
            pointB = p2;

        } else if (
            d02 >= d01 &&
            d02 >= d12
        ) {

            topLeft = p1;
            pointA = p0;
            pointB = p2;

        } else {

            topLeft = p2;
            pointA = p0;
            pointB = p1;
        }


        /*
         * Determine orientation using the cross product.
         *
         * We want:
         *
         * topLeft → topRight
         * topLeft → bottomLeft
         *
         * to form the correct orientation.
         */
        const cross =
            this.crossProductZ(
                topLeft,
                pointA,
                pointB
            );


        let topRight;
        let bottomLeft;


        if (cross > 0) {

            topRight =
                pointA;

            bottomLeft =
                pointB;

        } else {

            topRight =
                pointB;

            bottomLeft =
                pointA;
        }


        return {
            topLeft: topLeft,
            topRight: topRight,
            bottomLeft: bottomLeft
        };
    }


    /**
     * Calculates the Z component of:
     *
     * (B - A) × (C - A)
     *
     * @param {Object} a
     * @param {Object} b
     * @param {Object} c
     *
     * @returns {number}
     */
    crossProductZ(
        a,
        b,
        c
    ) {

        const bx =
            b.x - a.x;

        const by =
            b.y - a.y;


        const cx =
            c.x - a.x;

        const cy =
            c.y - a.y;


        return (
            bx * cy -
            by * cx
        );
    }


    /**
     * Returns squared Euclidean distance between two points.
     *
     * Squared distance avoids unnecessary square roots when
     * only relative distances are needed.
     *
     * @param {Object} a
     * @param {Object} b
     *
     * @returns {number}
     */
    distanceSquared(a, b) {

        const dx =
            a.x - b.x;

        const dy =
            a.y - b.y;


        return (
            dx * dx +
            dy * dy
        );
    }


    /**
     * Returns Euclidean distance between two points.
     *
     * @param {Object} a
     * @param {Object} b
     *
     * @returns {number}
     */
    distance(a, b) {

        return Math.sqrt(
            this.distanceSquared(
                a,
                b
            )
        );
    }


    /**
     * Adds all five state counts.
     *
     * @param {number[]} stateCount
     * @returns {number}
     */
    sumCounts(stateCount) {

        return (
            stateCount[0] +
            stateCount[1] +
            stateCount[2] +
            stateCount[3] +
            stateCount[4]
        );
    }


    /**
     * Returns all currently detected finder candidates.
     *
     * A copy is returned so external code cannot modify the
     * internal array.
     *
     * @returns {Object[]}
     */
    getPossibleCenters() {

        return this.possibleCenters.map(
            center => ({
                x: center.x,
                y: center.y,
                estimatedModuleSize:
                    center.estimatedModuleSize,
                count: center.count
            })
        );
    }
}