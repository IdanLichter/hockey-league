/**
 * Single loader for the YouTube IFrame API.
 *
 * Lives here rather than inside a component because the API is a page-level
 * singleton: `window.onYouTubeIframeAPIReady` fires once, so two modules each
 * keeping their own promise would race (the second overwrites the first's
 * callback and its promise never resolves). Both the game-page player and the
 * feed's autoplaying cards import this one.
 */
let ytApiPromise = null

export function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script")
      tag.id = "youtube-iframe-api"
      tag.src = "https://www.youtube.com/iframe_api"
      document.head.appendChild(tag)
    }
  })
  return ytApiPromise
}
