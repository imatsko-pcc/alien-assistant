# Alien Assistant

A talking 3D alien that lives in the corner of a web page and reacts out loud to what you do. Click a button and it comments on it, fill in a form and it cheers you on, scroll to the bottom, copy some text, wander off and come back, rage-click something broken: it notices.

It speaks with an **ElevenLabs** voice (your own API key) or your browser's free built-in voice, its mouth moves with the words, and its eyes and head follow your mouse.

**Try it:** open `index.html` (a demo page with buttons, a form and long content to scroll).

## Add it to any page

Copy the `assistant/` folder next to your page and add one tag before `</body>`:

```html
<script src="assistant/alien-assistant.js" defer></script>
```

It loads three.js from a CDN, the alien head and the voice by itself. Your page's scripts can make it talk too:

```js
AlienAssistant.say('Your order is on its way!', 'happy'); // moods: happy, surprised, sad, wink, angry
AlienAssistant.openSettings();
```

## What it reacts to

| You… | It says something like |
| --- | --- |
| open the page | "Hi there, Earthling! I'm your alien assistant." |
| click a button or link | "Ooh, you pressed Get started!" |
| tick a checkbox | "Checked Send me space news. Got it!" |
| start and finish typing in a field | "Nice typing! Your name is looking good." |
| submit a form | "Form sent! Woohoo!" |
| click the same spot 4 times fast | "Whoa, easy there! Is something not working?" |
| scroll to the bottom | "You made it all the way to the bottom!" |
| copy text | "Copying that? Smart move, Earthling." |
| do nothing for 45 seconds | "Still there, Earthling? I'm getting lonely." |
| leave the tab and come back | "Welcome back! I missed you." |
| hit a JavaScript error on the page | "Uh oh, something broke on this page." |
| click the alien | a tip |

**Privacy:** it only notices *which* field you used (by its label), never what you type, and it ignores password fields completely. Nothing is sent anywhere except the text it speaks, which goes to ElevenLabs when you use an ElevenLabs key.

## Settings (the ⚙ next to the alien)

- **Speak out loud** and **Show speech bubbles** (either one alone works too: bubbles only, or voice only)
- **How chatty:** Quiet (only important things), Normal, or Chatty
- **React when I…** clicks, typing, scrolling and copying, idling and leaving the tab
- **Character:** 👽 Squeaky alien, ⚔️ Warrior alien (Klingon-style, deep voice with a growl, says *nuqneH!* and *Qapla'!*), 🤖 Robot alien, or Custom
- **Voice engine, ElevenLabs API key, Voice, Effect, Pitch, Speed, Volume**
- **Corner:** bottom right or bottom left

The 🔊 button mutes it, and – hides it (a small 👽 button brings it back). Everything works with the keyboard; **Esc** closes the settings. Settings are remembered in your browser.

### ElevenLabs key

Create a key at elevenlabs.io → *Developers → API Keys* with the **Text to Speech** and **Voices: read** permissions (and a credit limit if you like), then paste it into the settings and press **Save key**. It is saved only in your browser and sent only to ElevenLabs. **Never put the key in the code or commit it to GitHub:** this is a public page, and anyone could read it and spend your credits.

ElevenLabs has no pitch control, so the assistant asks for slower speech and plays it back faster, which raises the pitch while keeping your chosen speed. The growl and robot effects are Web Audio filters on the ElevenLabs audio (the browser voice can't be filtered).

## Files

```
index.html                       demo page
css/demo.css                     demo page styles
assistant/alien-assistant.js     the widget: loader, reactions, settings panel
assistant/alien-assistant.css    widget styles (all scoped to .aa-root)
assistant/alien-head.js          the 3D alien head (three.js)
assistant/voice.js               ElevenLabs / browser speech, effects, lip sync
```

The alien head and voice come from [Alien Head 3D](https://github.com/imatsko-pcc/alien-head-3d), the webcam version where the alien copies your face.
