import React from "react";
import LottieView from "lottie-react-native";

import type { AnimationObject } from "lottie-react-native";

interface LottieLoaderProps {
  source: string | { uri: string } | AnimationObject;
  loop?: boolean;
  autoPlay?: boolean;
  style?: object;
}

const LottieLoader: React.FC<LottieLoaderProps> = ({
  source,
  loop = true,
  autoPlay = true,
  style = { width: 200, height: 200 },
}) => (
  <LottieView source={source} autoPlay={autoPlay} loop={loop} style={style} />
);

export default LottieLoader;
