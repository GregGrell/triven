// FIT decoding (Garmin's official SDK)
import { Decoder, Stream } from 'https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.222.0/+esm';
export function decodeFit(bytes) {
  const dec = new Decoder(Stream.fromByteArray(bytes));
  if (!dec.isFIT()) throw new Error('not a FIT file');
  return dec.read({ convertDateTimesToDates: true, expandComponents: true, mergeHeartRates: true, applyScaleAndOffset: true, expandSubFields: true, convertTypesToStrings: true });
}
