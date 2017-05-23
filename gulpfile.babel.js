/* Theme builder and previewer.

   Minimize JavaScript.
   Convert SASS to CSS and minify.
   Start MkDocs server
*/
import yargs from "yargs"
import gulp from "gulp"
import gulpsync from "gulp-sync"
import sass from "gulp-sass"
import uglify from "gulp-uglify"
import postcss from "gulp-postcss"
import autoprefixer from "autoprefixer"
import cssnano from "cssnano"
import childProcess from "child_process"
import gulpif from "gulp-if"
import clean from "gulp-clean"
import concat from "gulp-concat"
import mqpacker from "css-mqpacker"
import stream from "webpack-stream"
import webpack from "webpack"
import sourcemaps from "gulp-sourcemaps"
import rollup from "gulp-rollup"
import rollupBabel from "rollup-plugin-babel"
import stylelint from "gulp-stylelint"
import eslint from "gulp-eslint"
import rev from "gulp-rev"
import revReplace from "gulp-rev-replace"

/* Argument Flags */
const args = yargs
  .default("compress", false)
  .default("lint", false)
  .default("clean", false)
  .default("sourcemaps", false)
  .default("webpack", false)
  .default("buildmkdocs", false)
  .default("revision", false)
  .argv

/* Create a gulp sync object */
const gsync = gulpsync(gulp)

/* Mkdocs server */
let mkdocs = null

// ------------------------------
// Configuration
// ------------------------------
const config = {
  files: {
    scss: "./docs/src/scss/*.scss",
    css: "./docs/theme/*.css",
    es6: "./docs/src/js/*.js",
    js: ["./docs/theme/*.js", "./docs/theme/*.js.map"],
    vendor: "./node_modules/clipboard/dist/*.js",
    gulp: "gulpfile.babel.js"
  },
  folders: {
    mkdocs: "./site",
    theme: "./docs/theme",
    src: "./docs/src"
  },
  compress: {
    enabled: args.compress,
    jsOptions: {
      warnings: false,
      screw_ie8: true,    // eslint-disable-line camelcase
      conditionals: true,
      unused: true,
      comparisons: true,
      sequences: true,
      dead_code: true,    // eslint-disable-line camelcase
      evaluate: true,
      if_return: true,    // eslint-disable-line camelcase
      join_vars: true     // eslint-disable-line camelcase
    }
  },
  lint: {
    enabled: args.lint
  },
  clean: args.clean,
  sourcemaps: args.sourcemaps,
  webpack: args.webpack,
  buildmkdocs: args.buildmkdocs,
  revision: args.revision
}

// ------------------------------
// SASS/SCSS processing
// ------------------------------
gulp.task("scss:build:sass", () => {
  const processors = [
    autoprefixer,
    mqpacker,
    (config.compress.enabled) ? cssnano : false
  ].filter(t => t)

  return gulp.src(config.files.scss)
    .pipe(sass({includePaths: [
      "node_modules/modularscale-sass/stylesheets",
      "node_modules/material-design-color",
      "node_modules/material-shadows"
    ]}).on("error", sass.logError))
    .pipe(postcss(processors))
    .pipe(concat("extra.css"))

    // Revisioning
    .pipe(gulpif(config.revision, rev()))
    .pipe(gulp.dest(config.folders.theme))
    .pipe(gulpif(config.revision, rev.manifest("manifest.json", {base: config.folders.theme, merge: true})))
    .pipe(gulpif(config.revision, gulp.dest(config.folders.theme)))
})

gulp.task("scss:build", ["scss:build:sass"], () => {
  return gulp.src(`${config.folders.src}/mkdocs.yml`)
    .pipe(gulpif(config.revision, revReplace({
      manifest: gulp.src("manifest.json"),
      replaceInExtensions: [".yml"]
    })))
    .pipe(gulp.dest("."))
})

gulp.task("scss:lint", () => {
  return gulp.src(config.files.scss)
    .pipe(
      stylelint({
        reporters: [
          {formatter: "string", console: true}
        ]
      }))
})

gulp.task("scss:watch", () => {
  gulp.watch(config.files.scss, ["scss:build"])
})

gulp.task("scss:clean", () => {
  return gulp.src(config.files.css)
    .pipe(clean())
})

// ------------------------------
// JavaScript processing
// ------------------------------
gulp.task("js:build:rollup", () => {
  return gulp.src(config.files.es6)
    .pipe(gulpif(config.sourcemaps, sourcemaps.init()))
    .pipe(rollup({
      "globals": {
        "clipboard": "Clipboard",
        "flowchart": "flowchart",
        "sequence-diagram": "Diagram"
      },
      "external": [
        "clipboard",
        "flowchart",
        "sequence-diagram"
      ],
      "format": "iife",
      "plugins": [
        rollupBabel({
          "presets": [
            ["es2015", {"modules": false}]
          ],
          babelrc: false,
          "plugins": ["external-helpers"]
        })
      ],
      "moduleName": "extra",
      "entry": `${config.folders.src}/js/extra.js`
    }))
    .pipe(gulpif(config.compress.enabled, uglify({compress: config.compress.jsOptions})))
    .pipe(gulpif(config.sourcemaps, sourcemaps.write(config.folders.theme)))

    // Revisioning
    .pipe(gulpif(config.revision, rev()))
    .pipe(gulp.dest(config.folders.theme))
    .pipe(gulpif(config.revision, rev.manifest("manifest.json", {base: config.folders.theme, merge: true})))
    .pipe(gulpif(config.revision, gulp.dest(config.folders.theme)))
})

gulp.task("js:build:webpack", () => {
  // Only needed if we want to pack some of the node packages.
  return gulp.src(config.files.es6)
    .pipe(
      stream(
        {
          devtool: (config.sourcemaps) ? "inline-source-map" : "",
          entry: "extra.js",
          output: {filename: "extra.js"},
          module: {
            loaders: [
              {
                test: /\.js$/,
                loader: "babel-loader"
              }
            ]
          },
          plugins: [
            // Don't emit assets that include errors
            new webpack.NoEmitOnErrorsPlugin(),
            new webpack.DefinePlugin({
              "process.env": {
                "NODE_ENV": JSON.stringify("production")
              }
            })
          ].concat(
            config.compress.enabled ? [
              new webpack.optimize.UglifyJsPlugin({
                sourceMap: config.sourcemaps,
                compress: config.compress.jsOptions,
                output: {comments: false}
              })
            ] : []
          ),
          stats: {color: true},
          resolve: {
            modules: [
              `${config.folders.src}/js`,
              "./node_modules/clipboard/dist"
            ],
            extensions: [
              ".js"
            ]
          }
        },
        webpack
      )
    )

    // Revisioning
    .pipe(gulpif(config.revision, rev()))
    .pipe(gulp.dest(config.folders.theme))
    .pipe(gulpif(config.revision, rev.manifest("manifest.json", {base: config.folders.theme, merge: true})))
    .pipe(gulpif(config.revision, gulp.dest(config.folders.theme)))
})

gulp.task("js:build", [config.webpack ? "js:build:webpack" : "js:build:rollup"], () => {
  return gulp.src(`${config.folders.src}/mkdocs.yml`)
    .pipe(gulpif(config.revision, revReplace({
      manifest: gulp.src("manifest.json"),
      replaceInExtensions: [".yml"]
    })))
    .pipe(gulp.dest("."))
})

gulp.task("js:lint", () => {
  return gulp.src([config.files.es6, config.files.gulp])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError())
})

gulp.task("js:watch", () => {
  gulp.watch(config.files.es6, ["js:build:rollup"])
})

gulp.task("js:clean", () => {
  return gulp.src(config.files.js)
    .pipe(clean())
})

// ------------------------------
// MkDocs
// ------------------------------
gulp.task("mkdocs:serve", () => {
  if (mkdocs) {
    mkdocs.kill()
  }
  mkdocs = childProcess.spawn(
    "mkdocs",
    ["serve", "--dev-addr", "0.0.0.0:8000"],
    {stdio: "inherit"})
})

gulp.task("mkdocs:build", () => {
  const proc = childProcess.spawnSync("mkdocs", ["build"])
  if (proc.status)
    throw new Error(`MkDocs error:\n${proc.stderr.toString()}`)
  return proc
})

gulp.task("mkdocs:clean", () => {
  return gulp.src(config.folders.mkdocs)
    .pipe(clean())
})

// ------------------------------
// Main entry points
// ------------------------------
gulp.task("build", gsync.sync([
  // Clean
  config.clean ? "clean" : ["scss:clean", "js:clean"],
  // Build JS and CSS
  "js:build",
  "scss:build",
  // Lint
  config.lint.enabled ? "lint" : false,
  // Build Mkdocs
  config.buildmkdocs ? "mkdocs:build" : false
].filter(t => t),
  "group:build"))

gulp.task("serve", gsync.sync([
  // Clean
  ["scss:clean", "js:clean"],
  // Build JS and CSS
  "js:build",
  "scss:build",
  // Watch for changes and start mkdocs
  ["scss:watch", "js:watch", "mkdocs:serve"]
].filter(t => t),
  "group:serve"))

gulp.task("clean", [
  "scss:clean",
  "js:clean",
  "mkdocs:clean"
])

gulp.task("lint", [
  "js:lint",
  "scss:lint"
])