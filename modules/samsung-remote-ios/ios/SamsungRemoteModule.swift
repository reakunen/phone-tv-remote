import ExpoModulesCore
import Foundation
import CryptoKit
import Security

private enum SamsungRemoteError: LocalizedError {
  case invalidHost
  case invalidUrl
  case openTimeout
  case unauthorized
  case pinMismatch
  case noServerTrust
  case socketClosed
  case sendFailed(String)
  case connectFailed(String)

  var errorDescription: String? {
    switch self {
    case .invalidHost:
      return "Only private LAN Samsung hosts are allowed for direct TLS override."
    case .invalidUrl:
      return "Samsung WebSocket URL was invalid."
    case .openTimeout:
      return "Samsung TV connection timed out."
    case .unauthorized:
      return "Samsung TV denied remote authorization."
    case .pinMismatch:
      return "Samsung TV certificate fingerprint changed. Re-pair this TV."
    case .noServerTrust:
      return "Samsung TLS trust challenge missing server trust."
    case .socketClosed:
      return "Samsung WebSocket closed before it opened."
    case .sendFailed(let details):
      return "Samsung payload failed to send: \(details)"
    case .connectFailed(let details):
      return "Samsung connection failed: \(details)"
    }
  }
}

private final class SamsungSessionDelegate: NSObject, URLSessionDelegate, URLSessionWebSocketDelegate {
  private let expectedHost: String
  private let pinnedFingerprint: String?

  private var openResolved = false
  private var openError: Error?
  private var openContinuation: CheckedContinuation<Void, Error>?

  var certificateFingerprintSha256: String?

  init(expectedHost: String, pinnedFingerprintSha256: String?) {
    self.expectedHost = expectedHost
    self.pinnedFingerprint = SamsungSessionDelegate.normalizeFingerprint(pinnedFingerprintSha256)
  }

  func waitForOpen() async throws {
    if let openError {
      throw openError
    }

    if openResolved {
      return
    }

    try await withCheckedThrowingContinuation { continuation in
      self.openContinuation = continuation
    }
  }

  func resolveOpen(error: Error? = nil) {
    guard !openResolved else {
      return
    }
    openResolved = true
    if let error {
      openError = error
    }

    guard let continuation = openContinuation else {
      return
    }

    openContinuation = nil
    if let error = error ?? openError {
      continuation.resume(throwing: error)
    } else {
      continuation.resume(returning: ())
    }
  }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    guard challenge.protectionSpace.host == expectedHost else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      resolveOpen(error: SamsungRemoteError.invalidHost)
      return
    }

    guard SamsungSessionDelegate.isPrivateLanHost(expectedHost) else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      resolveOpen(error: SamsungRemoteError.invalidHost)
      return
    }

    guard let serverTrust = challenge.protectionSpace.serverTrust else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      resolveOpen(error: SamsungRemoteError.noServerTrust)
      return
    }

    if let serverCertificate = SecTrustGetCertificateAtIndex(serverTrust, 0) {
      let serverCertData = SecCertificateCopyData(serverCertificate) as Data
      let computedFingerprint = SamsungSessionDelegate.sha256Hex(data: serverCertData)
      certificateFingerprintSha256 = computedFingerprint

      if let pinnedFingerprint, pinnedFingerprint != computedFingerprint {
        completionHandler(.cancelAuthenticationChallenge, nil)
        resolveOpen(error: SamsungRemoteError.pinMismatch)
        return
      }
    }

    completionHandler(.useCredential, URLCredential(trust: serverTrust))
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didOpenWithProtocol protocol: String?
  ) {
    resolveOpen()
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
    reason: Data?
  ) {
    resolveOpen(error: SamsungRemoteError.socketClosed)
  }

  private static func normalizeFingerprint(_ raw: String?) -> String? {
    guard let raw else {
      return nil
    }

    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return nil
    }

    return trimmed
      .lowercased()
      .replacingOccurrences(of: ":", with: "")
      .replacingOccurrences(of: " ", with: "")
  }

  private static func sha256Hex(data: Data) -> String {
    SHA256.hash(data: data)
      .compactMap { String(format: "%02x", $0) }
      .joined()
  }

  static func isPrivateLanHost(_ host: String) -> Bool {
    let value = host.lowercased()
    if value == "localhost" || value.hasSuffix(".local") {
      return true
    }

    let parts = value.split(separator: ".")
    guard parts.count == 4 else {
      return false
    }

    let octets = parts.compactMap { Int($0) }
    guard octets.count == 4 else {
      return false
    }

    if octets[0] == 10 || octets[0] == 127 {
      return true
    }

    if octets[0] == 192 && octets[1] == 168 {
      return true
    }

    if octets[0] == 172 && (16...31).contains(octets[1]) {
      return true
    }

    return false
  }
}

private struct SamsungSendResult {
  let token: String?
  let certificateFingerprintSha256: String?
}

private final class SamsungSecureWebSocketSender {
  func send(
    host: String,
    key: String,
    token: String?,
    pinnedFingerprintSha256: String?
  ) async throws -> SamsungSendResult {
    guard SamsungSessionDelegate.isPrivateLanHost(host) else {
      throw SamsungRemoteError.invalidHost
    }

    let appName = Data("PhoneRemote".utf8).base64EncodedString()
    let tokenParam = (token?.isEmpty == false)
      ? "&token=\((token ?? "").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
      : ""

    guard let url = URL(string: "wss://\(host):8002/api/v2/channels/samsung.remote.control?name=\(appName)\(tokenParam)") else {
      throw SamsungRemoteError.invalidUrl
    }

    let delegate = SamsungSessionDelegate(
      expectedHost: host,
      pinnedFingerprintSha256: pinnedFingerprintSha256
    )

    let config = URLSessionConfiguration.ephemeral
    config.waitsForConnectivity = false
    config.timeoutIntervalForRequest = 6

    let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    let webSocket = session.webSocketTask(with: url)
    webSocket.resume()

    do {
      try await withTimeout(seconds: 5.0) {
        try await delegate.waitForOpen()
      }
    } catch {
      webSocket.cancel(with: .goingAway, reason: nil)
      session.invalidateAndCancel()
      throw error
    }

    let receiveTask = Task<String?, Error> {
      try await self.listenForTokenOrUnauthorized(on: webSocket)
    }

    let payload: [String: Any] = [
      "method": "ms.remote.control",
      "params": [
        "Cmd": "Click",
        "DataOfCmd": key,
        "Option": "false",
        "TypeOfRemote": "SendRemoteKey"
      ]
    ]

    do {
      let payloadData = try JSONSerialization.data(withJSONObject: payload)
      guard let payloadString = String(data: payloadData, encoding: .utf8) else {
        throw SamsungRemoteError.sendFailed("Failed to encode payload string.")
      }

      try await webSocket.send(.string(payloadString))
    } catch {
      receiveTask.cancel()
      webSocket.cancel(with: .abnormalClosure, reason: nil)
      session.invalidateAndCancel()
      throw SamsungRemoteError.sendFailed(error.localizedDescription)
    }

    let discoveredToken: String?
    do {
      let tokenWaitTimeout = (token?.isEmpty == false) ? 0.6 : 12.0
      discoveredToken = try await awaitTokenOrTimeout(
        receiveTask: receiveTask,
        timeoutSeconds: tokenWaitTimeout
      )
    } catch {
      receiveTask.cancel()
      webSocket.cancel(with: .normalClosure, reason: nil)
      session.invalidateAndCancel()
      throw error
    }

    receiveTask.cancel()
    webSocket.cancel(with: .normalClosure, reason: nil)
    session.invalidateAndCancel()

    return SamsungSendResult(
      token: discoveredToken,
      certificateFingerprintSha256: delegate.certificateFingerprintSha256
    )
  }

  private func listenForTokenOrUnauthorized(on webSocket: URLSessionWebSocketTask) async throws -> String? {
    while !Task.isCancelled {
      let message = try await webSocket.receive()
      let text: String

      switch message {
      case .string(let value):
        text = value
      case .data(let data):
        guard let value = String(data: data, encoding: .utf8) else {
          continue
        }
        text = value
      @unknown default:
        continue
      }

      guard let eventPayload = parseSamsungEvent(text) else {
        continue
      }

      if eventPayload.event == "ms.channel.unauthorized" {
        throw SamsungRemoteError.unauthorized
      }

      if eventPayload.event == "ms.channel.connect", let token = eventPayload.token, !token.isEmpty {
        return token
      }
    }

    return nil
  }

  private func parseSamsungEvent(_ text: String) -> (event: String, token: String?)? {
    guard let data = text.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let event = json["event"] as? String else {
      return nil
    }

    let payload = json["data"] as? [String: Any]
    let directStringToken = payload?["token"] as? String
    let directNumericToken = (payload?["token"] as? NSNumber)?.stringValue

    var clientToken: String?
    if let clients = payload?["clients"] as? [[String: Any]] {
      for client in clients {
        guard let attributes = client["attributes"] as? [String: Any] else {
          continue
        }

        if let token = attributes["token"] as? String, !token.isEmpty {
          clientToken = token
          break
        }

        if let tokenNumber = attributes["token"] as? NSNumber {
          let value = tokenNumber.stringValue
          if !value.isEmpty {
            clientToken = value
            break
          }
        }
      }
    }

    let token = directStringToken ?? directNumericToken ?? clientToken
    return (event, token)
  }

  private func awaitTokenOrTimeout(
    receiveTask: Task<String?, Error>,
    timeoutSeconds: Double
  ) async throws -> String? {
    try await withThrowingTaskGroup(of: String?.self) { group in
      group.addTask {
        try await receiveTask.value
      }

      group.addTask {
        try await Task.sleep(nanoseconds: UInt64(timeoutSeconds * 1_000_000_000))
        return nil
      }

      let result = try await group.next() ?? nil
      group.cancelAll()
      return result
    }
  }

  private func withTimeout<T>(
    seconds: Double,
    operation: @escaping () async throws -> T
  ) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
      group.addTask {
        try await operation()
      }

      group.addTask {
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
        throw SamsungRemoteError.openTimeout
      }

      let result = try await group.next()!
      group.cancelAll()
      return result
    }
  }
}

public final class SamsungRemoteModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SamsungRemoteModule")

    AsyncFunction("sendSamsungKey") { (
      host: String,
      key: String,
      token: String?,
      pinnedFingerprintSha256: String?
    ) async throws -> [String: String] in
      let sender = SamsungSecureWebSocketSender()
      let result = try await sender.send(
        host: host,
        key: key,
        token: token,
        pinnedFingerprintSha256: pinnedFingerprintSha256
      )

      var payload: [String: String] = [:]
      if let token = result.token {
        payload["token"] = token
      }
      if let certificateFingerprintSha256 = result.certificateFingerprintSha256 {
        payload["certificateFingerprintSha256"] = certificateFingerprintSha256
      }
      return payload
    }
  }
}
