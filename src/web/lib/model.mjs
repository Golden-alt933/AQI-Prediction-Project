/** Predict next-day AQI with the compact sklearn RandomForestRegressor export. */
export function predictAQI(model, readings) {
  if (
    !model ||
    !Array.isArray(model.features) ||
    !Array.isArray(model.medians) ||
    !Array.isArray(model.indicatorFeatures) ||
    !Array.isArray(model.trees)
  ) {
    throw new TypeError("Invalid AQI model payload");
  }
  if (!readings || typeof readings !== "object")
    throw new TypeError("Readings must be an object");
  const isBlank = (value) =>
    value == null || (typeof value === "string" && value.trim() === "");
  const aqi = readings.aqi_today;
  if (isBlank(aqi) || !Number.isFinite(Number(aqi)) || Number(aqi) < 0) {
    throw new RangeError("A valid, non-negative aqi_today reading is required");
  }

  const raw = model.features.map((feature) => {
    const value = readings[feature];
    if (isBlank(value)) return Number.NaN;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0)
      throw new RangeError(
        `${feature} must be a non-negative finite number or blank`,
      );
    return numeric;
  });
  const transformed = raw.map((value, index) =>
    Number.isNaN(value) ? model.medians[index] : value,
  );
  for (const index of model.indicatorFeatures)
    transformed.push(Number.isNaN(raw[index]) ? 1 : 0);
  // sklearn's tree predictor converts the input matrix to float32 before walking nodes.
  const input = Float32Array.from(transformed);
  if (Array.from(input).some((value) => !Number.isFinite(value))) {
    throw new RangeError(
      "Readings exceed the finite range supported by the trained model",
    );
  }
  let forestTotal = 0;
  for (const tree of model.trees) {
    let node = 0;
    while (tree.left[node] !== -1) {
      const feature = tree.feature[node];
      node =
        input[feature] <= tree.threshold[node]
          ? tree.left[node]
          : tree.right[node];
    }
    forestTotal += tree.value[node];
  }
  return forestTotal / model.trees.length;
}
