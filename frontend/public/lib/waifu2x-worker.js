self.w = null;

self.onmessage = function (e) {
  var msg = e.data;
  if (msg.type === "init") {
    Promise.all([
      fetch(msg.modelsPath + "/scale2.0x_model.json").then(function(r) { return r.json(); }),
      fetch(msg.modelsPath + "/noise1_model.json").then(function(r) { return r.json(); }),
    ])
      .then(function(models) {
        self.w = new self.Waifu2x({
          scale2xModel: models[0],
          noiseModel: models[1],
          scale: 2,
          isDenoising: true,
        });
        self.postMessage({ type: "ready" });
      })
      .catch(function(err) {
        self.postMessage({ type: "error", error: "Model load failed: " + err.message });
      });
    return;
  }

  if (msg.type === "process" && self.w) {
    var imageData = msg.imageData;
    self.w.calc(
      imageData.data,
      imageData.width,
      imageData.height,
      function(image2x, width, height) {
        self.postMessage(
          { type: "result", id: msg.id, image2x: image2x, width: width, height: height },
          [image2x.buffer],
        );
      },
      function(phase, doneRatio) {
        self.postMessage({ type: "progress", id: msg.id, phase: phase, doneRatio: doneRatio });
      },
    );
  }
};
