// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import AppKit
import CoreGraphics

let root = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
let logURL = root.appendingPathComponent("fixture.jsonl")
FileManager.default.createFile(atPath: logURL.path, contents: nil)
let log = try FileHandle(forWritingTo: logURL)
func emit(_ value: [String: Any]) {
    var row = value; row["unix"] = Date().timeIntervalSince1970
    if let data = try? JSONSerialization.data(withJSONObject: row) { log.write(data); log.write(Data([10])) }
}
class BenchScroll: NSScrollView {
    override func scrollWheel(with event: NSEvent) {
        let received = ProcessInfo.processInfo.systemUptime
        super.scrollWheel(with: event)
        emit(["kind": "received", "eventUptime": event.timestamp, "latencyMs": max(0, received-event.timestamp)*1000, "offset": contentView.bounds.origin.y])
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.regular)
var windows: [NSWindow] = []; var scrolls: [BenchScroll] = []
for name in ["A", "B"] {
    let window = NSWindow(contentRect: NSRect(x: 20, y: 40, width: 1000, height: 680), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
    window.title = "Screenpipe Cloud Benchmark \(name)"
    let scroll = BenchScroll(frame: NSRect(x: 0, y: 0, width: 1000, height: 680))
    scroll.hasVerticalScroller = true; scroll.autoresizingMask = [.width, .height]
    let doc = NSView(frame: NSRect(x: 0, y: 0, width: 980, height: 800 * 36))
    for i in 0..<800 {
        for column in 0..<3 {
            let label = NSTextField(labelWithString: "\(name) ROW \(String(format: "%04d", i)) · COL \(column) · capture fidelity")
            label.frame = NSRect(x: 12 + column * 320, y: i * 36, width: 310, height: 30)
            label.font = NSFont.monospacedSystemFont(ofSize: 14, weight: .regular)
            label.textColor = i % 2 == 0 ? .systemBlue : .labelColor
            doc.addSubview(label)
        }
    }
    scroll.documentView = doc; window.contentView = scroll
    windows.append(window); scrolls.append(scroll)
}
windows[0].makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps: true)
var lastID = ""; var lastBeat = ProcessInfo.processInfo.systemUptime
let heartbeat = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
    let now = ProcessInfo.processInfo.systemUptime
    emit(["kind": "heartbeat", "delayMs": max(0, now-lastBeat-0.05)*1000]); lastBeat=now
}
RunLoop.main.add(heartbeat, forMode: .common)
let commands = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
    guard let data = try? Data(contentsOf: root.appendingPathComponent("command.json")),
          let c = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let id = c["id"] as? String, id != lastID else { return }
    lastID = id
    let index = c["window"] as? Int ?? 0
    windows[index].makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps: true)
    if c["reset"] as? Bool ?? false {
        scrolls[index].contentView.scroll(to: NSPoint(x: 0, y: 14000)); scrolls[index].reflectScrolledClipView(scrolls[index].contentView)
    }
    let seconds = c["seconds"] as? Double ?? 0
    let direction = c["direction"] as? Int32 ?? -12
    emit(["kind": "command", "id": id, "seconds": seconds, "window": index])
    // Post real native input from a background queue. The main-thread receiver
    // independently logs delivered events and UI timer delay.
    DispatchQueue.global().async {
        CGWarpMouseCursorPosition(CGPoint(x: 400, y: 400))
        let start = ProcessInfo.processInfo.systemUptime
        var ticks = 0
        while ProcessInfo.processInfo.systemUptime-start < seconds {
            let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: direction, wheel2: 0, wheel3: 0)!
            event.post(tap: .cghidEventTap); ticks += 1
            Thread.sleep(forTimeInterval: 0.05)
        }
        DispatchQueue.main.async {
            emit(["kind": "done", "id": id, "ticks": ticks])
            let done: [String: Any] = ["id": id, "unix": Date().timeIntervalSince1970, "ticks": ticks]
            if let d = try? JSONSerialization.data(withJSONObject: done) { try? d.write(to: root.appendingPathComponent("done.json"), options: .atomic) }
        }
    }
}
RunLoop.main.add(commands, forMode: .common)
emit(["kind": "ready", "screenRecording": CGPreflightScreenCaptureAccess(), "accessibility": AXIsProcessTrusted(), "screenWidth": CGDisplayPixelsWide(CGMainDisplayID()), "screenHeight": CGDisplayPixelsHigh(CGMainDisplayID())])
app.run()
