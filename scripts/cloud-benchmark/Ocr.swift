// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import Foundation
import Vision

// Read downloaded synthetic images only. OCR is secondary context evidence,
// not a proof that every glyph or pixel is correct.
let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let paths = try JSONDecoder().decode([String].self, from: data)
for path in paths {
    autoreleasepool {
        var result: [String: Any] = ["path": path]
        do {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            request.recognitionLanguages = ["en-US"]
            try VNImageRequestHandler(url: URL(fileURLWithPath: path)).perform([request])
            result["text"] = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
        } catch { result["error"] = String(describing: error) }
        let encoded = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        print(String(data: encoded, encoding: .utf8)!)
        fflush(stdout)
    }
}
