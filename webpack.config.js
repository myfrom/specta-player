const path = require('path'),
      webpack = require('webpack'),
      autoprefixer = require('autoprefixer'),
      cssnano = require('cssnano'),
      swPlugin = require('serviceworker-webpack-plugin');

const DEV = process.env.NODE_ENV !== 'production';

const BABEL_OPTIONS = (() => {
  const output = {
    presets: [
      ['@babel/preset-env', {
        useBuiltIns: 'usage',
        modules: 'commonjs',
        corejs: '3.x'
      }]
    ],
    plugins: [
      '@babel/plugin-syntax-dynamic-import',
      '@babel/plugin-proposal-optional-chaining'
    ]
  };
  if (!DEV) output.presets.push(['minify', { builtIns: false }]);
  return output;
})();

let config = {
  mode: DEV ? 'development' : 'production',
  context: path.resolve(__dirname, './src'),
  entry: {
    'js/index': './js/index.js',
  },
  output: {
    path: path.resolve(__dirname, './dist'),
    chunkFilename: 'js/[name]-[chunkhash].js',
    filename: '[name].js'
  },
  resolve: {
    alias: {
      'shared': path.resolve(__dirname, '../src/shared')
    }
  },
  devtool: DEV ? 'inline-cheap-module-source-map' : false,
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: [ path.resolve(__dirname, 'node-modules'), /\bcore-js\b/ ],
        use: [{
          loader: 'babel-loader',
          options: BABEL_OPTIONS
        }]
      }, {
        test: /\.css$/,
        include: [ path.resolve(__dirname, 'src/elements') ],
        use: [
          {
            loader: 'raw-loader'
          }, {
            loader: 'postcss-loader',
            options: {
              ident: 'postcss',
              plugins: [
                autoprefixer(),
                !DEV ? cssnano() : undefined
              ]
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new swPlugin({
      entry: path.resolve(__dirname, 'src/js/service-worker.js'),
      filename: 'service-worker.js',
      // We don't want any files to be inserted by Webpack,
      // we have a setup using Gulp and Workbox
      includes: [],
      minimize: !DEV
    })
  ]
}

function scripts() {
  return new Promise(resolve => webpack(config, (err, stats) => {
    if (err) console.log('Webpack:', err);
    console.log(stats.toString());
    resolve();
  }));
}

module.exports = { config, scripts };