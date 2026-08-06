import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count > 1,
      let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let data = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: data),
      let cgImage = bitmap.cgImage else {
    fputs("Could not read receipt image.\n", stderr)
    exit(2)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-US"]

try VNImageRequestHandler(cgImage: cgImage).perform([request])
let observations = (request.results ?? []).sorted {
    if abs($0.boundingBox.midY - $1.boundingBox.midY) > 0.01 {
        return $0.boundingBox.midY > $1.boundingBox.midY
    }
    return $0.boundingBox.minX < $1.boundingBox.minX
}

for observation in observations {
    if let text = observation.topCandidates(1).first?.string {
        print(text)
    }
}
