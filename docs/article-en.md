# Anna Operating System

The idea for this project came to me after two events.

The first happened on a plane. I had nothing to do, so I decided to watch the science fiction film **"Her" (2013)**. I’m an impressionable person, and if a story has drama, I easily start empathizing with the characters. The film is about a lonely man who installs an AI operating system, starts talking to it, and gradually falls in love with it. I won’t spoil it — the movie is truly worth watching.

The second event was the hype around **OpenClaw**. I had just returned home, got back to my regular work, and in my free time decided to explore what it was. By then, there had already been a lot of buzz around the project, and it had managed to gain around **300 thousand stars on GitHub**.

It really impressed me. The feeling was almost like in an Iron Man movie: you launch an AI, and, like Jarvis, it performs tasks and talks to you almost like a living companion. But pretty quickly it became clear that this approach has two serious difficulties.

The first is that you need at least a general understanding of how OpenClaw works internally: what nodes are, what channels are, how components are connected, and other technical concepts.

The second is that everything is configured through a step-by-step text wizard in the terminal. That kind of approach is aimed more at a technically skilled user or an AI specialist, not an ordinary person.

It is no surprise that today many companies either offer a preconfigured OpenClaw in their cloud or sell installation and setup services tailored to specific use cases.

At some point I realized that I wanted to build a different kind of product — **one that is friendly to an ordinary user**, literally at the level of a “non-technical home user.” My goal is to create an MVP for Windows where, on first launch, a person simply goes through a clear setup wizard: fills in a few fields, checks a few boxes, and describes in a few words what they want from their AI assistant.

The idea is that this assistant would **live permanently on the home computer**, and you could communicate with it not only through the application window, but also through a messenger such as Telegram. Such an assistant could notify you about an important email, remind you to call your mom on Friday evening, tell you that the smartphone you are tracking has dropped in price, or simply help with everyday tasks.

## What already exists in the prototype

At this point, I have already managed to implement several important things.

### 1. A proper desktop application

I have already built a full-fledged application using **Electron + React**. This is not a set of terminal scripts, but a normal graphical program that can be launched like any other Windows application.

Inside, there is already an AI chat. The conversation history is stored locally, so nothing disappears after a restart. There is also an onboarding wizard on first launch, so the user does not have to manually edit files, search for environment variables, or figure out what needs to be pasted where.

### 2. A foundation for background assistant work

I have already implemented the basic mechanics for a scenario where the assistant does not just respond to requests, but **works alongside the user continuously**.

Right now, it is possible to create background tasks using plain language. For example:

* remind me about something in an hour;
* check something every day;
* monitor a situation in the background and write only when something truly important happens.

So this is no longer just a chat, but a system that can work independently and come back to the user with results.

### 3. External communication channels

The prototype already supports **Telegram**, so the assistant can be used not only from the application window, but also through a messenger.

In addition, I already have integration with **email**. The assistant can read messages, show the relevant ones, and help with sending replies. For the current prototype, this is already a very solid foundation on which the MVP can continue to be built.

## What I want to build next

The next stage for me is not just adding random features for flashy demos, but building a **strong and useful MVP** around scenarios that are genuinely needed in everyday life.

I separately listed the most common use cases for myself and realized one simple thing: first of all, I need to strengthen not the “magical” effects, but the **practical everyday value**.

That means the assistant should:

* help with reminders;
* sort through email and important messages;
* track prices and changes on websites;
* find needed information in personal files;
* provide a solid morning summary of the day.

### 1. A clear first-time user experience

The first thing I want to polish is a truly good step-by-step wizard for new users.

Not the kind where a person is simply shown empty fields and told “figure it out yourself,” but one where they connect things step by step:

* Telegram;
* email;
* search;
* news;
* calendar;
* and, if they want, their own document folders.

There, it will also be possible to configure a morning digest right away, so the assistant understands what matters to a specific person: emails, calendar events, news, reminders, and other signals.

### 2. Integration with core data sources

In the near future, I plan to integrate:

* weather;
* news;
* Brave Search;
* Google Calendar.

This opens up very clear real-life scenarios. For example, in the morning the assistant could send a short and useful summary: what the weather is like today, what important things are in the news, what meetings are on the calendar, and whether there are any urgent emails. Or a person could ask: “What do I have today?” — and get not a made-up answer, but a picture assembled from real sources.

### 3. Search across personal documents

Another important direction is **RAG-based search across local documents**.

I want the assistant to be able to find the needed information in the user’s folders without manually copying text into the chat. This is useful both at home and at work: finding a contract, remembering what was in some notes, quickly retrieving an old instruction, or locating an email.

For an ordinary user, this is one of the strongest features, because everyone accumulates digital clutter over time, and finding something later becomes increasingly difficult.

### 4. Smart background monitoring

I also want to strengthen background monitoring scenarios.

The idea is that the assistant should not only answer questions, but also **watch important things on its own**:

* prices;
* product availability;
* changes on websites;
* emails;
* other important events.

If the smartphone you want becomes cheaper, an appointment slot opens up for the date you need, an email arrives from an important person, or something changes on a website, the assistant should not stay silent until the next time the app is launched — it should reach out on its own.

### 5. Actions on the computer

Another important branch of development is integration with the computer at the level of actions.

I want the assistant to be able to launch Chrome, open and control regular Windows applications, and eventually perform remote actions on the home PC within approved scenarios.

This brings the project closer not just to an AI chat, but to a real digital assistant that can not only advise, but actually do things for the user.

## Immediate goal

In short, my near-term plan is:

* make the first-time user experience very clear;
* connect the core data sources;
* improve Telegram as the main external communication channel;
* add search across personal documents;
* build a strong MVP around the most common everyday scenarios.

I do not want to build a project around magic for the sake of magic. A much more important question for me is: **will an ordinary person actually use this every day**? If the answer is yes, then I am moving in the right direction.

## Links

Project source code:
**[https://github.com/evgenyigumnov/anna-operating-system](https://github.com/evgenyigumnov/anna-operating-system)**

Latest Windows release:
**[https://github.com/evgenyigumnov/anna-operating-system/releases/tag/0.0.2](https://github.com/evgenyigumnov/anna-operating-system/releases/tag/0.0.2)**

If you would like to help or participate in the project, you can message me on Telegram:
**[https://t.me/ievkz](https://t.me/ievkz)**
