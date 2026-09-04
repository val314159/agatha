/*
 * Access the user's media devices (webcam) using getUserMedia.
 * Display the video feed in a div element (#feed).
 * Take snapshots of the video feed on button click or automatically every 5 seconds.
 */

function your_eyes(videoElement, snapshot, snapBtn, interval) {

    const seconds = 1000

    if(!videoElement)
	videoElement = document.getElementById('feed')

    if(!snapshot)
	snapshot = document.getElementById('snapshot')
    
    if(!snapBtn)
	snapBtn = document.getElementById('snap-btn')

    if(!interval)
	interval = 15*seconds

    let stream

    function gotStream(newStream) {
	if (videoElement) {
	    stream = newStream
	    videoElement.srcObject = stream
	    videoElement.play()
	} else {
	    console.error('Error: Video element not found.')
	}
    }

    function handleError(error) {
	console.error('Error accessing media devices.', error)
    }

    // Access the user's webcam feed
    navigator.mediaDevices.getUserMedia({ video: true })
	.then(gotStream)
	.catch(handleError)

    const canvas = document.createElement('canvas')

    // Take a snapshot of the video feed and display it in #snapshot element
    function takeSnapshot() {
	console.log("TS0", stream)
	if (stream && stream.active) {
	    canvas.width = videoElement.videoWidth
	    canvas.height = videoElement.videoHeight

	    const ctx = canvas.getContext('2d')
	    ctx.drawImage(videoElement, 0, 0)

	    const timestamp = new Date().toISOString().replace(/[\-T\:\.]/g, '') // Get UTC timestamp
	    const filename = `image_${timestamp}.jpg`

	    canvas.toBlob(async blob=>{
		console.log("TO BLOB", blob)

		const formData = new FormData()

		const timestampBlob = new Blob([timestamp], { type: 'text/plain' })
		formData.append('timestamp', timestampBlob)

		//const url = URL.createObjectURL(blob)
		
		formData.append('image', blob, filename)

		PREFIX = 'http://localhost:5002'
		
		fetch ( PREFIX + '/uploads', {
		    method: 'POST',
		    body: formData,
		} ) .then(response => response.json())
		    .then(data => console.log(data))
		    .catch(error => {
			console.error('Error uploading snapshot:', error)
		    })
	    })

	    snapshot.src = canvas.toDataURL('image/jpeg', 0.1)
	    snapshot.style.display = 'block'

	    /*
	    fetch ( '/uploads', {
		method: 'POST',
		body: formData,
	    } ) .then(response => response.json())
		.then(data => console.log(data))
		.catch(error => {
		    console.error('Error uploading snapshot:', error)
		})
	    */
	    
	} else {
	    console.error('Error: Video stream not active or not found.')
	}
    }

    // Take an initial snapshot immediately after accessing the webcam feed
    setTimeout(takeSnapshot, 1000)

    // Automatically take snapshots every 5 seconds
    let snapshotIntervalId = setInterval(takeSnapshot, interval)

    // Handle manual snapshot button click
    snapBtn.addEventListener('click', takeSnapshot)

    // Stop taking automatic snapshots when the page is closed or refreshed
    window.addEventListener('beforeunload', () => clearInterval(snapshotIntervalId))
}
