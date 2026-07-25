// regex to remove any emails
const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g

// Regex to remove any twitter handles
const twitterRegex = /(^|[^@\w])@(\w{1,15})\b/g

// Regex to remove any urls (with or without http(s))
const urlRegex = /((https?:\/\/)?[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?)/gm

const cleanupDescription = (description: string): string => {
	return description.replace(emailRegex, '').replace(twitterRegex, '').replace(urlRegex, '').trim()
}

export default cleanupDescription
