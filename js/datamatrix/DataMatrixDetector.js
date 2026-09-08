/**
 * DataMatrixDetector
 *
 * Detects and samples an ECC200 Data Matrix symbol from a BitMatrix.
 *
 * The detector:
 *   1. Finds the black-pixel bounding region.
 *   2. Estimates the module pitch from black/white run lengths.
 *   3. Tests every legal ECC200 symbol size against the observed bounds.
 *   4. Tries all four rotations.
 *   5. Samples the candidate symbol at module centres.
 *   6. Scores the four ECC200 finder/timing borders.
 *   7. Returns the highest-confidence sampled symbol.
 *
 * This approach is deliberately robust for clean generated barcode
 * images and avoids estimating symbol dimensions solely from transition
 * counts along synthetic bounding-box corner lines.
 *
 * Requires:
 *   BitMatrix.js
 */
class DataMatrixDetector {

    static DEBUG = true;

    // =========================================================
    // ECC200 SYMBOL DIMENSIONS
    // =========================================================

    static SYMBOL_SIZES = [

        // Square symbols
        [10, 10],
        [12, 12],
        [14, 14],
        [16, 16],
        [18, 18],
        [20, 20],
        [22, 22],
        [24, 24],
        [26, 26],
        [32, 32],
        [36, 36],
        [40, 40],
        [44, 44],
        [48, 48],
        [52, 52],
        [64, 64],
        [72, 72],
        [80, 80],
        [88, 88],
        [96, 96],
        [104, 104],
        [120, 120],
        [132, 132],
        [144, 144],

        // Classic rectangular ECC200
        [18, 8],
        [32, 8],
        [26, 12],
        [36, 12],
        [36, 16],
        [48, 16]
    ];


    constructor(options = {}) {

        this.options = {

            minimumDimension: 8,
            maximumDimension: 144,

            minimumConfidence: 0.58,

            // How different horizontal/vertical module pitch may be.
            maximumPitchRatio: 1.75,

            // Number of candidate dimensions retained after geometric
            // ranking before full sampling.
            maximumCandidates: 12,

            ...options
        };
    }


    // =========================================================
    // DEBUG
    // =========================================================

    debug(...args) {

        if (!DataMatrixDetector.DEBUG) {
            return;
        }

        console.log(
            "[DataMatrixDetector]",
            ...args
        );
    }


    debugError(...args) {

        if (!DataMatrixDetector.DEBUG) {
            return;
        }

        console.error(
            "[DataMatrixDetector ERROR]",
            ...args
        );
    }


    debugMatrix(matrix, title = "MATRIX") {

        if (!DataMatrixDetector.DEBUG) {
            return;
        }

        console.log(
            `[DataMatrixDetector] ${title} ` +
            `${matrix.width}x${matrix.height}`
        );

        let output = "";

        for (let y = 0; y < matrix.height; y++) {

            let line = "";

            for (let x = 0; x < matrix.width; x++) {

                line += matrix.get(x, y)
                    ? "##"
                    : "..";
            }

            output += line + "\n";
        }

        console.log(output);
    }


    // =========================================================
    // MAIN DETECTOR
    // =========================================================

    detect(image) {

        try {

            this.debug(
                "========================================"
            );

            this.debug(
                "START DATA MATRIX DETECTION"
            );

            this.debug(
                "========================================"
            );


            this.validateImage(image);


            this.debug(
                "Input image:",
                `${image.width}x${image.height}`
            );


            // =================================================
            // STEP 1 - FIND BLACK BOUNDS
            // =================================================

            const bounds =
                this.findBlackBounds(image);

            if (!bounds) {

                throw new Error(
                    "No black pixels found in image."
                );
            }


            this.debug(
                "Black bounds:",
                bounds
            );


            // =================================================
            // STEP 2 - ANALYSE RUN LENGTHS
            // =================================================

            const runAnalysis =
                this.analyseRunLengths(
                    image,
                    bounds
                );


            this.debug(
                "Horizontal runs:",
                runAnalysis.horizontalRuns
            );

            this.debug(
                "Vertical runs:",
                runAnalysis.verticalRuns
            );

            this.debug(
                "Estimated horizontal module pitch:",
                runAnalysis.pitchX
            );

            this.debug(
                "Estimated vertical module pitch:",
                runAnalysis.pitchY
            );


            // =================================================
            // STEP 3 - BUILD LEGAL DIMENSION CANDIDATES
            // =================================================

            const candidates =
                this.buildDimensionCandidates(
                    bounds,
                    runAnalysis
                );


            if (candidates.length === 0) {

                throw new Error(
                    "Unable to find a plausible ECC200 symbol size."
                );
            }


            this.debug(
                "----------------------------------------"
            );

            this.debug(
                "GEOMETRIC DIMENSION CANDIDATES"
            );


            for (
                let i = 0;
                i < candidates.length;
                i++
            ) {

                const candidate =
                    candidates[i];

                this.debug(
                    `#${i + 1}`,
                    `${candidate.columns}x${candidate.rows}`,
                    "pitch =",
                    candidate.pitchX.toFixed(3),
                    "x",
                    candidate.pitchY.toFixed(3),
                    "geometry =",
                    candidate.geometryScore.toFixed(4)
                );
            }


            // =================================================
            // STEP 4 - SAMPLE CANDIDATES
            // =================================================

            const results = [];


            for (
                let i = 0;
                i < candidates.length;
                i++
            ) {

                const candidate =
                    candidates[i];


                this.debug(
                    "========================================"
                );

                this.debug(
                    "TESTING:",
                    `${candidate.columns}x${candidate.rows}`
                );


                /*
                 * A symbol may be rotated in the image.
                 *
                 * We therefore sample the observed rectangle once,
                 * then rotate the sampled matrix through all four
                 * canonical orientations.
                 */

                const sampled =
                    this.sampleBounds(
                        image,
                        bounds,
                        candidate.columns,
                        candidate.rows
                    );


                for (
                    let rotation = 0;
                    rotation < 4;
                    rotation++
                ) {

                    const rotated =
                        this.rotateMatrix(
                            sampled,
                            rotation
                        );


                    /*
                     * 90/270-degree rotation swaps dimensions.
                     */

                    const columns =
                        rotated.width;

                    const rows =
                        rotated.height;


                    if (
                        !this.isLegalSymbolSize(
                            columns,
                            rows
                        )
                    ) {

                        continue;
                    }


                    const evaluation =
                        this.evaluateCandidate(
                            rotated,
                            columns,
                            rows,
                            candidate.geometryScore,
                            rotation
                        );


                    results.push(
                        evaluation
                    );


                    this.printEvaluation(
                        evaluation
                    );
                }
            }


            // =================================================
            // STEP 5 - SELECT BEST
            // =================================================

            if (results.length === 0) {

                throw new Error(
                    "No Data Matrix candidate could be sampled."
                );
            }


            results.sort(
                (a, b) =>
                    b.confidence -
                    a.confidence
            );


            const best =
                results[0];


            this.debug(
                "========================================"
            );

            this.debug(
                "BEST DATA MATRIX CANDIDATE"
            );

            this.debug(
                "========================================"
            );

            this.debug(
                "Dimensions:",
                `${best.columns}x${best.rows}`
            );

            this.debug(
                "Rotation:",
                `${best.rotation * 90} degrees`
            );

            this.debug(
                "Geometry score:",
                best.geometryScore.toFixed(4)
            );

            this.debug(
                "Border score:",
                best.borderScore.toFixed(4)
            );

            this.debug(
                "Border scores:",
                best.borderScores
            );

            this.debug(
                "Confidence:",
                best.confidence.toFixed(4)
            );


            this.debugMatrix(
                best.matrix,
                "FINAL SAMPLED DATA MATRIX"
            );


            if (
                best.confidence <
                this.options.minimumConfidence
            ) {

                throw new Error(
                    "Detected region does not contain a sufficiently " +
                    "confident Data Matrix symbol. " +
                    `Best=${best.confidence.toFixed(4)}, ` +
                    `dimension=${best.columns}x${best.rows}.`
                );
            }


            this.debug(
                "========================================"
            );

            this.debug(
                "END DATA MATRIX DETECTION"
            );

            this.debug(
                "========================================"
            );


            return {

                matrix:
                    best.matrix,

                points: [
                    {
                        x: bounds.left,
                        y: bounds.top
                    },
                    {
                        x: bounds.right,
                        y: bounds.top
                    },
                    {
                        x: bounds.right,
                        y: bounds.bottom
                    },
                    {
                        x: bounds.left,
                        y: bounds.bottom
                    }
                ],

                width:
                    best.columns,

                height:
                    best.rows,

                columns:
                    best.columns,

                rows:
                    best.rows,

                borderScore:
                    best.borderScore,

                confidence:
                    best.confidence,

                rotation:
                    best.rotation * 90,

                modulePitchX:
                    best.pitchX,

                modulePitchY:
                    best.pitchY
            };


        } catch (error) {

            this.debugError(
                "========================================"
            );

            this.debugError(
                "DETECTION FAILED"
            );

            this.debugError(
                error
            );

            this.debugError(
                "Message:",
                error && error.message
                    ? error.message
                    : String(error)
            );

            this.debugError(
                "========================================"
            );

            throw error;
        }
    }


    // =========================================================
    // VALIDATION
    // =========================================================

    validateImage(image) {

        if (
            typeof BitMatrix === "undefined"
        ) {

            throw new Error(
                "BitMatrix.js is not loaded."
            );
        }


        if (
            !(image instanceof BitMatrix)
        ) {

            throw new TypeError(
                "DataMatrixDetector.detect requires a BitMatrix."
            );
        }


        if (
            image.width <= 0 ||
            image.height <= 0
        ) {

            throw new Error(
                "Data Matrix input image has invalid dimensions."
            );
        }
    }


    // =========================================================
    // BLACK BOUNDS
    // =========================================================

    findBlackBounds(image) {

        let left =
            image.width;

        let right =
            -1;

        let top =
            image.height;

        let bottom =
            -1;


        for (
            let y = 0;
            y < image.height;
            y++
        ) {

            for (
                let x = 0;
                x < image.width;
                x++
            ) {

                if (
                    !image.get(
                        x,
                        y
                    )
                ) {

                    continue;
                }


                if (x < left) {
                    left = x;
                }

                if (x > right) {
                    right = x;
                }

                if (y < top) {
                    top = y;
                }

                if (y > bottom) {
                    bottom = y;
                }
            }
        }


        if (
            right < left ||
            bottom < top
        ) {

            return null;
        }


        return {

            left:
                left,

            right:
                right,

            top:
                top,

            bottom:
                bottom,

            width:
                right - left + 1,

            height:
                bottom - top + 1
        };
    }


    // =========================================================
    // RUN LENGTH ANALYSIS
    // =========================================================

    analyseRunLengths(
        image,
        bounds
    ) {

        const horizontalRuns = [];
        const verticalRuns = [];


        /*
         * Analyse many scan lines instead of relying on one
         * particular finder/timing border.
         */

        const horizontalStep =
            Math.max(
                1,
                Math.floor(
                    bounds.height / 20
                )
            );


        for (
            let y = bounds.top;
            y <= bounds.bottom;
            y += horizontalStep
        ) {

            const runs =
                this.collectRunsOnHorizontalLine(
                    image,
                    bounds.left,
                    bounds.right,
                    y
                );


            for (
                let i = 0;
                i < runs.length;
                i++
            ) {

                horizontalRuns.push(
                    runs[i]
                );
            }
        }


        const verticalStep =
            Math.max(
                1,
                Math.floor(
                    bounds.width / 20
                )
            );


        for (
            let x = bounds.left;
            x <= bounds.right;
            x += verticalStep
        ) {

            const runs =
                this.collectRunsOnVerticalLine(
                    image,
                    bounds.top,
                    bounds.bottom,
                    x
                );


            for (
                let i = 0;
                i < runs.length;
                i++
            ) {

                verticalRuns.push(
                    runs[i]
                );
            }
        }


        const pitchX =
            this.estimateBaseRunLength(
                horizontalRuns
            );


        const pitchY =
            this.estimateBaseRunLength(
                verticalRuns
            );


        return {

            horizontalRuns:
                horizontalRuns,

            verticalRuns:
                verticalRuns,

            pitchX:
                pitchX,

            pitchY:
                pitchY
        };
    }


    // =========================================================
    // HORIZONTAL RUNS
    // =========================================================

    collectRunsOnHorizontalLine(
        image,
        left,
        right,
        y
    ) {

        const runs = [];

        if (
            right < left
        ) {

            return runs;
        }


        let previous =
            image.get(
                left,
                y
            );

        let length = 1;


        for (
            let x = left + 1;
            x <= right;
            x++
        ) {

            const current =
                image.get(
                    x,
                    y
                );


            if (
                current === previous
            ) {

                length++;

            } else {

                runs.push(
                    length
                );

                previous =
                    current;

                length = 1;
            }
        }


        runs.push(
            length
        );


        return runs;
    }


    // =========================================================
    // VERTICAL RUNS
    // =========================================================

    collectRunsOnVerticalLine(
        image,
        top,
        bottom,
        x
    ) {

        const runs = [];

        if (
            bottom < top
        ) {

            return runs;
        }


        let previous =
            image.get(
                x,
                top
            );

        let length = 1;


        for (
            let y = top + 1;
            y <= bottom;
            y++
        ) {

            const current =
                image.get(
                    x,
                    y
                );


            if (
                current === previous
            ) {

                length++;

            } else {

                runs.push(
                    length
                );

                previous =
                    current;

                length = 1;
            }
        }


        runs.push(
            length
        );


        return runs;
    }


    // =========================================================
    // BASE RUN LENGTH
    // =========================================================

    estimateBaseRunLength(runs) {

        if (
            !runs ||
            runs.length === 0
        ) {

            return null;
        }


        const filtered =
            runs.filter(
                value =>
                    Number.isFinite(value) &&
                    value > 0
            );


        if (
            filtered.length === 0
        ) {

            return null;
        }


        /*
         * Most barcode runs are one or a small integer number of
         * modules wide. The lower part of the run-length distribution
         * therefore provides a useful module-pitch estimate.
         */

        filtered.sort(
            (a, b) =>
                a - b
        );


        const lowerCount =
            Math.max(
                1,
                Math.floor(
                    filtered.length * 0.35
                )
            );


        const lower =
            filtered.slice(
                0,
                lowerCount
            );


        return this.median(
            lower
        );
    }


    // =========================================================
    // BUILD DIMENSION CANDIDATES
    // =========================================================

    buildDimensionCandidates(
        bounds,
        runAnalysis
    ) {

        const candidates = [];


        for (
            let i = 0;
            i < DataMatrixDetector.SYMBOL_SIZES.length;
            i++
        ) {

            const size =
                DataMatrixDetector.SYMBOL_SIZES[i];


            const columns =
                size[0];

            const rows =
                size[1];


            if (
                columns <
                    this.options.minimumDimension ||
                rows <
                    this.options.minimumDimension ||
                columns >
                    this.options.maximumDimension ||
                rows >
                    this.options.maximumDimension
            ) {

                continue;
            }


            const pitchX =
                bounds.width /
                columns;


            const pitchY =
                bounds.height /
                rows;


            if (
                pitchX <= 0 ||
                pitchY <= 0
            ) {

                continue;
            }


            const ratio =
                Math.max(
                    pitchX,
                    pitchY
                ) /
                Math.min(
                    pitchX,
                    pitchY
                );


            if (
                ratio >
                this.options.maximumPitchRatio
            ) {

                continue;
            }


            let runScoreX = 0.5;
            let runScoreY = 0.5;


            if (
                Number.isFinite(
                    runAnalysis.pitchX
                ) &&
                runAnalysis.pitchX > 0
            ) {

                runScoreX =
                    this.pitchSimilarity(
                        pitchX,
                        runAnalysis.pitchX
                    );
            }


            if (
                Number.isFinite(
                    runAnalysis.pitchY
                ) &&
                runAnalysis.pitchY > 0
            ) {

                runScoreY =
                    this.pitchSimilarity(
                        pitchY,
                        runAnalysis.pitchY
                    );
            }


            const aspectObserved =
                bounds.width /
                bounds.height;


            const aspectExpected =
                columns /
                rows;


            const aspectScore =
                this.ratioSimilarity(
                    aspectObserved,
                    aspectExpected
                );


            const squarePitchScore =
                this.ratioSimilarity(
                    pitchX,
                    pitchY
                );


            const geometryScore =
                runScoreX * 0.25 +
                runScoreY * 0.25 +
                aspectScore * 0.30 +
                squarePitchScore * 0.20;


            candidates.push({

                columns:
                    columns,

                rows:
                    rows,

                pitchX:
                    pitchX,

                pitchY:
                    pitchY,

                geometryScore:
                    geometryScore
            });
        }


        candidates.sort(
            (a, b) =>
                b.geometryScore -
                a.geometryScore
        );


        return candidates.slice(
            0,
            this.options.maximumCandidates
        );
    }


    // =========================================================
    // PITCH SIMILARITY
    // =========================================================

    pitchSimilarity(
        observed,
        estimated
    ) {

        if (
            observed <= 0 ||
            estimated <= 0
        ) {

            return 0;
        }


        const ratio =
            Math.max(
                observed,
                estimated
            ) /
            Math.min(
                observed,
                estimated
            );


        return 1 / ratio;
    }


    ratioSimilarity(
        a,
        b
    ) {

        if (
            a <= 0 ||
            b <= 0
        ) {

            return 0;
        }


        const ratio =
            Math.max(
                a,
                b
            ) /
            Math.min(
                a,
                b
            );


        return 1 / ratio;
    }


    // =========================================================
    // SAMPLE COMPLETE BOUNDS
    // =========================================================

    sampleBounds(
        image,
        bounds,
        columns,
        rows
    ) {

        const result =
            new BitMatrix(
                columns,
                rows
            );


        const width =
            bounds.right -
            bounds.left +
            1;


        const height =
            bounds.bottom -
            bounds.top +
            1;


        for (
            let row = 0;
            row < rows;
            row++
        ) {

            const sourceY =
                bounds.top +
                (
                    (row + 0.5) /
                    rows
                ) *
                height;


            for (
                let column = 0;
                column < columns;
                column++
            ) {

                const sourceX =
                    bounds.left +
                    (
                        (column + 0.5) /
                        columns
                    ) *
                    width;


                if (
                    this.samplePoint(
                        image,
                        sourceX,
                        sourceY
                    )
                ) {

                    result.set(
                        column,
                        row
                    );
                }
            }
        }


        return result;
    }


    // =========================================================
    // SAMPLE PIXEL
    // =========================================================

    samplePoint(
        image,
        x,
        y
    ) {

        /*
         * Convert centre-coordinate sampling into a pixel index.
         *
         * floor() is intentional here. If the bounding rectangle is
         * exactly N modules wide, the centre of module zero is:
         *
         *     left + 0.5 * moduleWidth
         *
         * which should map into that module, not potentially round
         * across its boundary.
         */

        const px =
            Math.floor(x);


        const py =
            Math.floor(y);


        if (
            px < 0 ||
            py < 0 ||
            px >= image.width ||
            py >= image.height
        ) {

            return false;
        }


        return image.get(
            px,
            py
        );
    }


    // =========================================================
    // ROTATE MATRIX
    // =========================================================

    rotateMatrix(
        matrix,
        quarterTurns
    ) {

        let result =
            matrix;


        const turns =
            (
                quarterTurns % 4 +
                4
            ) % 4;


        for (
            let turn = 0;
            turn < turns;
            turn++
        ) {

            result =
                this.rotateMatrix90(
                    result
                );
        }


        return result;
    }


    rotateMatrix90(matrix) {

        const result =
            new BitMatrix(
                matrix.height,
                matrix.width
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
                    matrix.get(
                        x,
                        y
                    )
                ) {

                    result.set(
                        matrix.height -
                            1 -
                            y,
                        x
                    );
                }
            }
        }


        return result;
    }


    // =========================================================
    // LEGAL SYMBOL SIZE
    // =========================================================

    isLegalSymbolSize(
        columns,
        rows
    ) {

        for (
            let i = 0;
            i < DataMatrixDetector.SYMBOL_SIZES.length;
            i++
        ) {

            const size =
                DataMatrixDetector.SYMBOL_SIZES[i];


            if (
                size[0] === columns &&
                size[1] === rows
            ) {

                return true;
            }
        }


        return false;
    }


    // =========================================================
    // EVALUATE CANDIDATE
    // =========================================================

    evaluateCandidate(
        matrix,
        columns,
        rows,
        geometryScore,
        rotation
    ) {

        const borderScores =
            this.getBorderScores(
                matrix
            );


        const borderScore =
            this.scoreBordersFromScores(
                borderScores
            );


        /*
         * The two solid borders are especially important.
         *
         * A false candidate may accidentally produce reasonable
         * alternation, but producing a nearly solid left AND bottom
         * edge simultaneously is much harder.
         */

        const solidScore =
            (
                borderScores.left +
                borderScores.bottom
            ) /
            2;


        const timingScore =
            (
                borderScores.top +
                borderScores.right
            ) /
            2;


        let borderPenalty = 1.0;


        if (
            borderScores.left < 0.70
        ) {

            borderPenalty *= 0.35;
        }


        if (
            borderScores.bottom < 0.70
        ) {

            borderPenalty *= 0.35;
        }


        if (
            borderScores.top < 0.40
        ) {

            borderPenalty *= 0.55;
        }


        if (
            borderScores.right < 0.40
        ) {

            borderPenalty *= 0.55;
        }


        /*
         * Border structure has more authority than the preliminary
         * run-length estimate.
         */

        const confidence =
            (
                borderScore * 0.50 +
                solidScore * 0.20 +
                timingScore * 0.15 +
                geometryScore * 0.15
            ) *
            borderPenalty;


        return {

            matrix:
                matrix,

            columns:
                columns,

            rows:
                rows,

            rotation:
                rotation,

            geometryScore:
                geometryScore,

            borderScores:
                borderScores,

            borderScore:
                borderScore,

            solidScore:
                solidScore,

            timingScore:
                timingScore,

            borderPenalty:
                borderPenalty,

            confidence:
                confidence,

            pitchX:
                matrix.width > 0
                    ? columns
                    : 0,

            pitchY:
                matrix.height > 0
                    ? rows
                    : 0
        };
    }


    // =========================================================
    // EVALUATION DEBUG
    // =========================================================

    printEvaluation(result) {

        this.debug(
            "----------------------------------------"
        );

        this.debug(
            "Candidate:",
            `${result.columns}x${result.rows}`
        );

        this.debug(
            "Rotation:",
            `${result.rotation * 90} degrees`
        );

        this.debug(
            "Geometry:",
            result.geometryScore.toFixed(4)
        );

        this.debug(
            "Borders:",
            result.borderScores
        );

        this.debug(
            "Border score:",
            result.borderScore.toFixed(4)
        );

        this.debug(
            "Penalty:",
            result.borderPenalty.toFixed(4)
        );

        this.debug(
            "CONFIDENCE:",
            result.confidence.toFixed(4)
        );
    }


    // =========================================================
    // BORDER SCORES
    // =========================================================

    getBorderScores(matrix) {

        return {

            left:
                this.scoreSolidEdge(
                    matrix,
                    "left"
                ),

            bottom:
                this.scoreSolidEdge(
                    matrix,
                    "bottom"
                ),

            top:
                this.scoreAlternatingEdge(
                    matrix,
                    "top"
                ),

            right:
                this.scoreAlternatingEdge(
                    matrix,
                    "right"
                )
        };
    }


    scoreBorders(matrix) {

        return this.scoreBordersFromScores(
            this.getBorderScores(
                matrix
            )
        );
    }


    scoreBordersFromScores(scores) {

        return (
            scores.left * 0.30 +
            scores.bottom * 0.30 +
            scores.top * 0.20 +
            scores.right * 0.20
        );
    }


    // =========================================================
    // SOLID EDGE SCORE
    // =========================================================

    scoreSolidEdge(
        matrix,
        edge
    ) {

        const values =
            this.getEdgeValues(
                matrix,
                edge
            );


        if (
            values.length === 0
        ) {

            return 0;
        }


        let black = 0;


        for (
            let i = 0;
            i < values.length;
            i++
        ) {

            if (
                values[i]
            ) {

                black++;
            }
        }


        return (
            black /
            values.length
        );
    }


    // =========================================================
    // ALTERNATING EDGE SCORE
    // =========================================================

    scoreAlternatingEdge(
        matrix,
        edge
    ) {

        const values =
            this.getEdgeValues(
                matrix,
                edge
            );


        if (
            values.length < 2
        ) {

            return 0;
        }


        let transitions = 0;


        for (
            let i = 1;
            i < values.length;
            i++
        ) {

            if (
                values[i] !==
                values[i - 1]
            ) {

                transitions++;
            }
        }


        return (
            transitions /
            (values.length - 1)
        );
    }


    // =========================================================
    // EDGE VALUES
    // =========================================================

    getEdgeValues(
        matrix,
        edge
    ) {

        const values = [];


        if (
            edge === "top"
        ) {

            for (
                let x = 0;
                x < matrix.width;
                x++
            ) {

                values.push(
                    matrix.get(
                        x,
                        0
                    )
                );
            }


            return values;
        }


        if (
            edge === "bottom"
        ) {

            const y =
                matrix.height - 1;


            for (
                let x = 0;
                x < matrix.width;
                x++
            ) {

                values.push(
                    matrix.get(
                        x,
                        y
                    )
                );
            }


            return values;
        }


        if (
            edge === "left"
        ) {

            for (
                let y = 0;
                y < matrix.height;
                y++
            ) {

                values.push(
                    matrix.get(
                        0,
                        y
                    )
                );
            }


            return values;
        }


        if (
            edge === "right"
        ) {

            const x =
                matrix.width - 1;


            for (
                let y = 0;
                y < matrix.height;
                y++
            ) {

                values.push(
                    matrix.get(
                        x,
                        y
                    )
                );
            }


            return values;
        }


        throw new Error(
            `Unknown Data Matrix edge: ${edge}`
        );
    }


    // =========================================================
    // BORDER VALIDATION
    // =========================================================

    validateBorders(matrix) {

        const scores =
            this.getBorderScores(
                matrix
            );


        return (
            scores.left >= 0.70 &&
            scores.bottom >= 0.70 &&
            scores.top >= 0.40 &&
            scores.right >= 0.40
        );
    }


    // =========================================================
    // TRANSITION COUNT
    // =========================================================

    countTransitions(
        image,
        from,
        to
    ) {

        let x0 =
            Math.round(
                from.x
            );

        let y0 =
            Math.round(
                from.y
            );

        let x1 =
            Math.round(
                to.x
            );

        let y1 =
            Math.round(
                to.y
            );


        x0 =
            this.clamp(
                x0,
                0,
                image.width - 1
            );

        y0 =
            this.clamp(
                y0,
                0,
                image.height - 1
            );

        x1 =
            this.clamp(
                x1,
                0,
                image.width - 1
            );

        y1 =
            this.clamp(
                y1,
                0,
                image.height - 1
            );


        const dx =
            Math.abs(
                x1 - x0
            );

        const sx =
            x0 < x1
                ? 1
                : -1;

        const dy =
            -Math.abs(
                y1 - y0
            );

        const sy =
            y0 < y1
                ? 1
                : -1;


        let error =
            dx + dy;


        let previous =
            image.get(
                x0,
                y0
            );


        let transitions = 0;


        while (true) {

            const current =
                image.get(
                    x0,
                    y0
                );


            if (
                current !==
                previous
            ) {

                transitions++;

                previous =
                    current;
            }


            if (
                x0 === x1 &&
                y0 === y1
            ) {

                break;
            }


            const doubled =
                2 * error;


            if (
                doubled >= dy
            ) {

                error += dy;
                x0 += sx;
            }


            if (
                doubled <= dx
            ) {

                error += dx;
                y0 += sy;
            }
        }


        return transitions;
    }


    // =========================================================
    // COMPATIBILITY METHODS
    // =========================================================

    findCornersFromBounds(bounds) {

        return {

            topLeft: {
                x: bounds.left,
                y: bounds.top
            },

            topRight: {
                x: bounds.right,
                y: bounds.top
            },

            bottomRight: {
                x: bounds.right,
                y: bounds.bottom
            },

            bottomLeft: {
                x: bounds.left,
                y: bounds.bottom
            }
        };
    }


    getCanonicalTransitions(
        image,
        corners
    ) {

        return {

            left:
                this.countTransitions(
                    image,
                    corners.topLeft,
                    corners.bottomLeft
                ),

            bottom:
                this.countTransitions(
                    image,
                    corners.bottomLeft,
                    corners.bottomRight
                ),

            top:
                this.countTransitions(
                    image,
                    corners.topLeft,
                    corners.topRight
                ),

            right:
                this.countTransitions(
                    image,
                    corners.topRight,
                    corners.bottomRight
                )
        };
    }


    sampleGrid(
        image,
        corners,
        columns,
        rows
    ) {

        const bounds = {

            left:
                Math.min(
                    corners.topLeft.x,
                    corners.bottomLeft.x
                ),

            right:
                Math.max(
                    corners.topRight.x,
                    corners.bottomRight.x
                ),

            top:
                Math.min(
                    corners.topLeft.y,
                    corners.topRight.y
                ),

            bottom:
                Math.max(
                    corners.bottomLeft.y,
                    corners.bottomRight.y
                )
        };


        return this.sampleBounds(
            image,
            bounds,
            columns,
            rows
        );
    }


    // =========================================================
    // MATH HELPERS
    // =========================================================

    median(values) {

        if (
            !values ||
            values.length === 0
        ) {

            return null;
        }


        const sorted =
            Array.from(values).sort(
                (a, b) =>
                    a - b
            );


        const middle =
            Math.floor(
                sorted.length / 2
            );


        if (
            sorted.length % 2 === 1
        ) {

            return sorted[
                middle
            ];
        }


        return (
            sorted[middle - 1] +
            sorted[middle]
        ) / 2;
    }


    clamp(
        value,
        minimum,
        maximum
    ) {

        return Math.max(
            minimum,
            Math.min(
                maximum,
                value
            )
        );
    }


    distance(
        a,
        b
    ) {

        const dx =
            b.x - a.x;

        const dy =
            b.y - a.y;


        return Math.sqrt(
            dx * dx +
            dy * dy
        );
    }


    crossProduct(
        a,
        b,
        c
    ) {

        return (
            (b.x - a.x) *
            (c.y - a.y)
        ) - (
            (b.y - a.y) *
            (c.x - a.x)
        );
    }


    samePoint(
        a,
        b
    ) {

        return (
            a.x === b.x &&
            a.y === b.y
        );
    }


    interpolatePoint(
        from,
        to,
        amount
    ) {

        return {

            x:
                from.x +
                (
                    to.x -
                    from.x
                ) *
                amount,

            y:
                from.y +
                (
                    to.y -
                    from.y
                ) *
                amount
        };
    }


    bilinearPoint(
        corners,
        u,
        v
    ) {

        const inverseU =
            1 - u;

        const inverseV =
            1 - v;


        return {

            x:
                inverseU *
                inverseV *
                corners.topLeft.x +

                u *
                inverseV *
                corners.topRight.x +

                u *
                v *
                corners.bottomRight.x +

                inverseU *
                v *
                corners.bottomLeft.x,

            y:
                inverseU *
                inverseV *
                corners.topLeft.y +

                u *
                inverseV *
                corners.topRight.y +

                u *
                v *
                corners.bottomRight.y +

                inverseU *
                v *
                corners.bottomLeft.y
        };
    }
}