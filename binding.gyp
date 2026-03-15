{
  "targets": [
    {
      "target_name": "js_sane",
      "sources": [
        "src/native/sane.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "libraries": [
        "-lsane"
      ],
      "cflags_cc": [
        "-std=c++17"
      ]
    }
  ]
}
