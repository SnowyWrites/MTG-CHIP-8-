class Tokenizer {
	constructor(source) {
		this.source = source;
		this.pos = 0;       // current position in source
		this.tokens = [];   // output token list
	}

	tokenize() {
		while (this.pos < this.source.length) {
			this.skipWhitespaceAndComments();
			if (this.pos >= this.source.length) break;
			this.readNextToken();
		}
		this.tokens.push({ type: 'EOF', value: null });
		return this.tokens;
	}

	peek() {
		return this.source[this.pos];
	}

	advance() {
		return this.source[this.pos++];
	}

	readNextToken() {
		const ch = this.peek();

		if (this.isDigit(ch)) { this.readNumber(); return; }
		if (this.isAlpha(ch)) { this.readIdentifier(); return; }

		// Single and double character symbols
		switch (ch) {
			case '=':
				this.advance();
				if (this.peek() === '=') { this.advance(); this.tokens.push({ type: 'EQUALS_EQUALS', value: '==' }); }
				else { this.tokens.push({ type: 'EQUALS', value: '=' }); }
				return;
			case '!':
				this.advance();
				if (this.peek() === '=') { this.advance(); this.tokens.push({ type: 'NOT_EQUALS', value: '!=' }); }
				return;
			case '+': this.advance(); this.tokens.push({ type: 'PLUS', value: '+' }); return;
			case '-':
				this.advance();
				if (this.peek() === '>') {
					this.advance();
					this.tokens.push({ type: 'ARROW', value: '->' });
				} else {
					this.tokens.push({ type: 'MINUS', value: '-' });
				}
				return;
			case '&': this.advance(); this.tokens.push({ type: 'AND', value: '&' }); return;
			case '|': this.advance(); this.tokens.push({ type: 'OR', value: '|' }); return;
			case '^': this.advance(); this.tokens.push({ type: 'XOR', value: '^' }); return;
			case '>': this.advance(); this.tokens.push({ type: 'GREATER', value: '>' }); return;
			case '<': this.advance(); this.tokens.push({ type: 'LESS', value: '<' }); return;
			case ';': this.advance(); this.tokens.push({ type: 'SEMICOLON', value: ';' }); return;
			case '{': this.advance(); this.tokens.push({ type: 'LBRACE', value: '{' }); return;
			case '}': this.advance(); this.tokens.push({ type: 'RBRACE', value: '}' }); return;
			case '(': this.advance(); this.tokens.push({ type: 'LPAREN', value: '(' }); return;
			case ')': this.advance(); this.tokens.push({ type: 'RPAREN', value: ')' }); return;
			case ',': this.advance(); this.tokens.push({ type: 'COMMA', value: ',' }); return;
			case '.': this.advance(); this.tokens.push({ type: 'DOT', value: '.' }); return;
			case '*': this.advance(); this.tokens.push({ type: 'STAR', value: '*' }); return;

			default:
				this.advance(); // make sure this line is there
		}
	}

	readNumber() {
		let num = '';
		// Handle hex (0xFF)
		if (this.peek() === '0' && this.source[this.pos + 1] === 'x') {
			this.advance(); this.advance(); // skip 0x
			while (this.isHexDigit(this.peek())) num += this.advance();
			this.tokens.push({ type: 'NUMBER', value: parseInt(num, 16) });
		} else {
			while (this.isDigit(this.peek())) num += this.advance();
			this.tokens.push({ type: 'NUMBER', value: parseInt(num, 10) });
		}
	}

	readIdentifier() {
		let word = '';
		while (this.isAlphaNumeric(this.peek())) word += this.advance();

		// Check if it's a keyword
		const keywords = {
			'let': 'LET', 'define': 'DEFINE',
			'call': 'CALL', 'if': 'IF', 'else': 'ELSE',
			'loop': 'LOOP', 'draw': 'DRAW', 'at': 'AT',
			'clear': 'CLEAR', 'screen': 'SCREEN', 'store': 'STORE',
			'load': 'LOAD', 'to': 'TO', 'into': 'INTO',
			'wait': 'WAIT', 'timer': 'TIMER', 'key': 'KEY',
			'pressed': 'PRESSED', 'released': 'RELEASED', 'random': 'RANDOM',
			'down': 'DOWN'
		};

		const type = keywords[word] || 'IDENTIFIER';
		this.tokens.push({ type, value: word });
	}

	skipWhitespaceAndComments() {
		while (this.pos < this.source.length) {
			const ch = this.peek();
			if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
				this.advance();
			} else if (ch === '#') {
				// Comment — skip to end of line
				while (this.pos < this.source.length && this.peek() !== '\n') {
					this.advance();
				}
			} else {
				break;
			}
		}
	}

	isDigit(ch) { return ch >= '0' && ch <= '9'; }
	isHexDigit(ch) { return /[0-9a-fA-F]/.test(ch); }
	isAlpha(ch) { return /[a-zA-Z_]/.test(ch); }
	isAlphaNumeric(ch) { return /[a-zA-Z0-9_]/.test(ch); }
}
