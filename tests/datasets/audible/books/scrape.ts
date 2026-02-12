import { HtmlBook } from '#config/types'

export const parsedB08G9PRS1K: HtmlBook = {
	genres: [
		{
			asin: '18580606011',
			name: 'Science Fiction & Fantasy',
			type: 'genre'
		},
		{
			asin: '18580629011',
			name: 'Adventure',
			type: 'tag'
		},
		{
			asin: '18580639011',
			name: 'Hard Science Fiction',
			type: 'tag'
		},
		{
			asin: '18580645011',
			name: 'Space Opera',
			type: 'tag'
		}
	]
}

export const parsedB017V4IM1G: HtmlBook = {
	genres: [
		{
			asin: '18572091011',
			name: "Children's Audiobooks",
			type: 'genre'
		},
		{ asin: '18572588011', name: 'Action & Adventure', type: 'tag' }
	]
}

export const parsedB08C6YJ1LS: HtmlBook = {
	genres: [
		{
			asin: '18574597011',
			name: 'Mystery, Thriller & Suspense',
			type: 'genre'
		},
		{ asin: '18574623011', name: 'Crime Thrillers', type: 'tag' }
	]
}

// Mock HTML responses for testing
export const mockHtmlB08G9PRS1K = `
<html>
<body>
	<ul>
		<li class="categoriesLabel">
			<a href="/tag/Science-Fiction-Fantasy-Audiobooks/18580606011">Science Fiction & Fantasy</a>
		</li>
	</ul>
	<div class="bc-chip-group">
		<a href="/cat/Adventure-Audiobooks/18580629011">Adventure</a>
		<a href="/cat/Hard-Science-Fiction-Audiobooks/18580639011">Hard Science Fiction</a>
		<a href="/cat/Space-Opera-Audiobooks/18580645011">Space Opera</a>
	</div>
</body>
</html>
`

export const mockHtmlB017V4IM1G = `
<html>
<body>
	<ul>
		<li class="categoriesLabel">
			<a href="/tag/Childrens-Audiobooks/18572091011">Children's Audiobooks</a>
		</li>
	</ul>
	<div class="bc-chip-group">
		<a href="/cat/Action-Adventure-Audiobooks/18572588011">Action & Adventure</a>
	</div>
</body>
</html>
`

export const mockHtmlB08C6YJ1LS = `
<html>
<body>
	<ul>
		<li class="categoriesLabel">
			<a href="/tag/Mystery-Thriller-Suspense-Audiobooks/18574597011">Mystery, Thriller & Suspense</a>
		</li>
	</ul>
	<div class="bc-chip-group">
		<a href="/cat/Crime-Thrillers-Audiobooks/18574623011">Crime Thrillers</a>
	</div>
</body>
</html>
`
