#!/usr/bin/env node

const Discord = require("discord.js");
const Intents = Discord.Intents;
const client = new Discord.Client({
  intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "DIRECT_MESSAGES", "DIRECT_MESSAGE_REACTIONS"/*, "GUILD_MEMBERS", "GUILD_PRESENCES"*/],
  partials: ["MESSAGE", "CHANNEL", "REACTION"],
});
const fetch = require("node-fetch");
const axios = require("axios");
const userScore = require("./mongooseModels/mongooseUserScoreModel.js");
const generatedRound = require("./mongooseModels/mongooseGeneratedRoundModel.js");
const mongoose = require("mongoose");
const gitlog = require("gitlog").default;

const helpMessage = "AwesomeSciBo has migrated to using slash commands! You can take a look at the different commands by typing `/` and clicking on the AwesomeSciBo icon."

const slashCommands = [
  {
    "name": "train",
    "description": "Sends a single training question to be answered",
    "options": [
      {
        "type": 3,
        "name": "subject",
        "description": "Optional subject to be used as a filter",
        "default": false,
        "required": false
      }
    ]
  },
  {
    "name": "help",
    "description": "Replies with a help message explaining what the bot can do"
  },
  {
    "name": "rounds",
    "options": [
      {
        "type": 1,
        "name": "generate",
        "description": "Generates a round with randomized questions from https://scibowldb.com/",
        "options": []
      },
      {
        "type": 1,
        "name": "list",
        "description": "Lists your 5 most recently generated rounds with links",
        "options": []
      },
      {
        "type": 1,
        "name": "hit",
        "description": "Shows the total number of rounds hit as well as the number for the specific user",
        "options": []
      }
    ],
    "description": "Commands regarding rounds generated by AwesomeSciBo"
  },
  {
    "name": "top",
    "description": "Lists top ten scores across servers (server specific leaderboard WIP)"
  },
  {
    "name": "about",
    "options": [
      {
        "type": 1,
        "name": "contributors",
        "description": "Lists contributors to the AwesomeSciBo bot",
        "options": []
      },
      {
        "type": 1,
        "name": "changelog",
        "description": "Lists the 5 most recent changes in a \"git log\" type format",
        "options": []
      },
      {
        "type": 1,
        "name": "bot",
        "description": "Lists information about AwesomeSciBo",
        "options": []
      }
    ],
    "description": "Commands regarding the creation/development of the bot"
  },
  {
    "name": "iss",
    "description": "Shows the location of the ISS on a map as well as all of the current astronauts within it"
  }
]

client.once("ready", () => {
  client.application.commands.set(slashCommands);

  // Connect to MongoDB using mongoose
  if (!process.env.CI) {
    mongoose
      .connect(process.env.MONGO_URI, {
        useUnifiedTopology: true,
        useNewUrlParser: true,
      })
      .then(() => {
        // Log client tag and set status
        console.log(`Logged in as: ${client.user.username}!`);
        client.user.setActivity(
          'for "/helping" | Add me to your own server: adat.link/awscibo',
          { type: "WATCHING" }
        );
      })
      .catch((err) => console.log(err));
    }
});

client.on("guildCreate", (guild) => {
  //guild.commands.set(slashCommands);
  const welcomeChannel = guild.channels.cache
    .find(
      (channel) =>
        // Find channel by name
        channel.name === "general" && channel.type === "text"
    )
    if (welcomeChannel) {
      welcomeChannel.send("'Sup, I'm the AwesomeSciBo bot! Use `/help` to learn more about me!")
      .catch(console.error);
    }
});

async function updateScore(isCorrect, score, authorId) {
  if (!isCorrect) {
    return `Nice try! Your score is still ${score}.`;
  } else {
    score += 4;
    if (score == 4) {
      const newUserScore = new userScore({
        authorID: authorId,
        score: score,
      });
      newUserScore.save((err) =>
        err
          ? console.log("Error creating new user for scoring")
          : console.log("Sucessfully created user to score.")
      );
    } else {
      const doc = await userScore.findOne({
        authorID: authorId,
      });
      doc.score = doc.score + 4;
      doc.save();
    }

    return `Great job! Your score is now ${score}.`;
  }
}

function training(subject, interaction) {
  const authorId = interaction.user.id;
  let score;
  userScore
    .findOne({ authorID: authorId })
    .lean()
    .then((obj, err) => {
      if (!obj) {
        score = 0;
      } else if (obj) {
        score = obj.score;
      } else {
        console.log(err);
      }
    });

    let categoryArray = [];

    switch (subject) {
      case null:
        categoryArray = ["BIOLOGY", "PHYSICS", "CHEMISTRY", "EARTH AND SPACE", "ASTRONOMY", "MATH"];
        break;
      case "astro":
      case "astronomy":
        categoryArray = ["ASTRONOMY"]
        break;
      case "bio":
      case "biology":
        categoryArray = ["BIOLOGY"];
        break;
      case "ess":
      case "earth science":
      case "es":
        categoryArray = ["EARTH SCIENCE"];
        break;
      case "chem":
      case "chemistry":
        categoryArray = ["CHEMISTRY"];
        break;
      case "phys":
      case "physics":
        categoryArray = ["PHYSICS"];
        break;
      case "math":
        categoryArray = ["MATH"];
        break;
      case "energy":
        categoryArray = ["ENERGY"];
        break;
      default:
        interaction.reply("Not a valid subject!");
        return;
    }

    axios
      .post("https://scibowldb.com/api/questions/random", { categories: categoryArray })
      .then((res) => {
        data = res.data.question;
        const messageFilter = (m) => m.author.id === authorId;
        interaction.reply(data.tossup_question + `\n\n||Source: ${data.uri}||`).then(() => {
          interaction.channel.awaitMessages(messageFilter, {
              max: 1,
              time: 120000,
              errors: ["time"],
            })
            .then((answerMsg) => {
              answerMsg = answerMsg.first();

              let predicted = null;
              if (data.tossup_format === "Multiple Choice") {
                if (
                  answerMsg.content.charAt(0).toLowerCase() ===
                  data.tossup_answer.charAt(0).toLowerCase()
                ) {
                  predicted = "correct";
                } else {
                  predicted = "incorrect";
                }
              } else {
                if (
                  answerMsg.content.toLowerCase() ===
                  data.tossup_answer.toLowerCase()
                ) {
                  predicted = "correct";
                } else {
                  predicted = "incorrect";
                }
              }

              if (predicted === "correct") {
                updateScore(true, score, authorId).then((msgToReply) =>
                  answerMsg.reply(msgToReply)
                );
              } else {
                const overrideEmbed = new Discord.MessageEmbed()
                .setAuthor(answerMsg.author.tag, answerMsg.author.displayAvatarURL())
                .addField("Correct answer", `\`${data.tossup_answer}\``)
                .setDescription(`It seems your answer was incorrect. Please react with <:override:842778128966615060> to override your answer if you think you got it right.`)
                .setTimestamp();
                const overrideMsg = answerMsg.channel.send(
                  overrideEmbed
                )
                .then(overrideMsg => {
                  overrideMsg.react("<:override:842778128966615060>");
                  const filter = (reaction, user) => {
                    return (
                      ["override"].includes(reaction.emoji.name) &&
                      user.id === answerMsg.author.id
                    );
                  };
                  overrideMsg
                    .awaitReactions(filter, {
                      max: 1,
                    })
                    .then((userReaction) => {
                      updateScore(true, score, authorId).then((msgToReply) =>
                        answerMsg.reply(msgToReply)
                      );
                    }).catch(console.error);
                }).catch(console.error);
              }
            }).catch(error => { if (error) interaction.editReply("Sorry, the question timed out waiting for an answer.") });
        }).catch(console.error);
      }).catch(error => { if (error) interaction.reply("Sorry, there was a problem fetching the question. Please try again!") });
    }

function sendHelpMessage(interaction) {
  const helpEmbed = new Discord.MessageEmbed().setDescription(helpMessage).setColor("ffffff");
  interaction.reply(helpEmbed);
}

async function startScoring(message) {
  let scoreA = 0;
  let scoreB = 0;
  await message.channel
    .send(`Here's the score:\nTeam A: ${scoreA}\nTeam B: ${scoreB}`)
    .then((scoreboard) => {
      const filter = (m) => m.content.includes("do be");
      const collector = message.channel.createMessageCollector(filter, {
        time: 1500000,
      });
      collector.on("collect", (m) => {
        if (m.content.toLowerCase() === "/scoring a 4") {
          // A team gets toss-up
          m.delete({ timeout: 1000 }).catch(console.error);
          scoreA += 4;
          scoreboard.channel.send(
            `Here's the score:\nTeam A: ${scoreA}\nTeam B: ${scoreB}`
          );
        } else if (m.content.toLowerCase() === "/scoring a 10") {
          // A team gets bonus
          m.delete({ timeout: 1000 }).catch(console.error);
          scoreA += 10;
          scoreboard.channel.send(
            `Here's the score:\nTeam A: ${scoreA}\nTeam B: ${scoreB}`
          );
        } else if (m.content.toLowerCase() === "/scoring b 4") {
          // B team gets toss up
          m.delete({ timeout: 1000 }).catch(console.error);
          scoreB += 4;
          scoreboard.channel.send(
            `Here's the score:\nTeam A: ${scoreA}\nTeam B: ${scoreB}`
          );
        } else if (m.content.toLowerCase() === "/scoring b 10") {
          // B team gets bonus
          m.delete({ timeout: 1000 }).catch(console.error);
          scoreB += 10;
          scoreboard.channel.send(
            `Here's the score:\nTeam A: ${scoreA}\nTeam B: ${scoreB}`
          );
        } else if (m.content === "/scoring stop") {
          m.delete({ timeout: 1000 }).catch(console.error);
          scoreboard.delete({ timeout: 1000 });
          m.channel.send(
            `**FINAL SCORE:**\nTeam A: ${scoreA}\nTeam B: ${scoreB}`
          );
          collector.stop();
        }
      });
    });
}

function dontWorryBeHappy(message) {
  message.channel.send(
    new Discord.MessageEmbed()
      .setTitle(`Don't Worry Be Happy!`)
      .setImage("https://media.giphy.com/media/7OKC8ZpTT0PVm/giphy.gif")
      .setURL("https://youtu.be/d-diB65scQU")
  );
}

function showServerNumber(message) {
  message.channel.send(client.guilds.cache.size);
}

async function showIssLocation(interaction) {
  await fetch("http://api.open-notify.org/iss-now.json")
    .then((request) => request.json())
    .then((data) => {
      interaction.reply(
        new Discord.MessageEmbed()
          .setTitle("The current location of the ISS!")
          .setImage(
            `https://api.mapbox.com/styles/v1/mapbox/light-v10/static/pin-s+000(${data.iss_position.longitude},${data.iss_position.latitude})/-87.0186,20,1/1000x1000?access_token=pk.eyJ1IjoiYWRhd2Vzb21lZ3V5IiwiYSI6ImNrbGpuaWdrYzJ0bGYydXBja2xsNmd2YTcifQ.Ude0UFOf9lFcQ-3BANWY5A`
          )
          .setURL("https://spotthestation.nasa.gov/tracking_map.cfm")
      );
    }).catch(error => { if (error) interaction.editReply("Unable to fetch data. Please try again!") });
}

function showLeaderboard(interaction) {
  let messageContent = "";
  userScore
    .find({})
    .sort({ score: -1 }) // Sort by descending order
    .exec((err, obj) => {
      if (err) {
        console.log(err);
        return interaction.reply(
          "Uh oh! :( There was an internal error. Please try again."
        );
      }
      if (obj.length < 10) {
        // Need at least 10 scores for top 10
        return interaction.reply(
          `There are only ${obj.length} users, we need at least 10!`
        );
      }
      for (let i = 0; i < 10; i++) {
        messageContent += `${i + 1}: <@${obj[i].authorID}>: ${obj[i].score}\n`; // Loop through each user and add their name and score to leaderboard content
      }
      interaction.reply(
        new Discord.MessageEmbed()
          .setTitle("Top Ten!")
          .setDescription(messageContent)
      );
    });
}

async function about(action, interaction) {
  if (action === "contributors") {
    interaction.reply(
      new Discord.MessageEmbed().setTitle("Contributors")
      .addField("Creator", `<@745063586422063214> [ADawesomeguy#2235]`, true)
      .addField("Contributors", `<@650525101048987649> [tEjAs#8127]\n<@426864344463048705> [tetrident#9396]`, true) // Add more contributors here, first one is Abheek, second one is Tejas
      .setTimestamp()
    );
  } else if (action === "changelog") {
    let parentFolder = __dirname.split("/");
    parentFolder.pop();
    parentFolder = parentFolder.join("/");

    const commits = gitlog({
      repo: parentFolder,
      number: 5,
      fields: ["hash", "abbrevHash", "subject", "authorName", "authorDateRel"],
    });

    const changelogEmbed = new Discord.MessageEmbed()
    .setAuthor(interaction.user.tag, interaction.user.displayAvatarURL())
    .setTitle("Changelog")
    .setTimestamp();

    commits.forEach(commit => {
      changelogEmbed.addField(commit.abbrevHash, `> \`Hash:\`${commit.hash}\n> \`Subject:\`${commit.subject}\n> \`Author:\`${commit.authorName}\n> \`Date:\`${commit.authorDateRel}\n> \`Link\`: [GitHub](https://github.com/ADawesomeguy/AwesomeSciBo/commit/${commit.hash})\n`);
    });

    interaction.reply(changelogEmbed);
  } else if (action === "bot") {
    const aboutBotEmbed = new Discord.MessageEmbed()
    .setAuthor(interaction.user.tag, interaction.user.displayAvatarURL())
    .setTitle("About AwesomeSciBo")
    .addField("Servers", client.guilds.cache.size, true)
    .addField("Training Users", await userScore.countDocuments({}), true)
    .setTimestamp();

    interaction.reply(aboutBotEmbed);
  }
}

async function rounds(action, interaction) {
  if (action === "generate") {
    let i;
    let finalizedHTML = '<html><head><link rel="preconnect" href="https://fonts.gstatic.com"><link href="https://fonts.googleapis.com/css2?family=Ubuntu&display=swap" rel="stylesheet"> </head><body style="width: 70%; margin-left: auto; margin-right: auto;"><h2 style="text-align: center; text-decoration: underline overline; padding: 7px;">ROUND GENERATED BY AWESOMESCIBO USING THE SCIBOWLDB API</h2>';
      let tossup_question;
      let question_category;
      let tossup_format;
      let tossup_answer;
      let bonus_question;
      let bonus_format;
      let bonus_answer;
      let htmlContent = "";
      await axios.post("https://scibowldb.com/api/questions", { categories: ["BIOLOGY", "PHYSICS", "CHEMISTRY", "EARTH AND SPACE", "ASTRONOMY", "MATH"] })
        .then((response) => {
          for (i = 1; i < 26; i++) {
              data = response.data.questions[Math.floor(Math.random() * response.data.questions.length)];
              tossup_question = data.tossup_question;
              tossup_answer = data.tossup_answer;
              question_category = data.category;
              tossup_format = data.tossup_format;
              bonus_question = data.bonus_question;
              bonus_answer = data.bonus_answer;
              bonus_format = data.bonus_format;
              htmlContent = `<br><br><h3 style="text-align: center;"><strong>TOSS-UP</strong></h3>\n<br>` + `${i}) <strong>${question_category}</strong>` + " " + `<em>${tossup_format}</em>` + " " + tossup_question + "<br><br>" + "<strong>ANSWER:</strong> " + tossup_answer + "<br>";
              htmlContent += `<br><br><h3 style="text-align: center;"><strong>BONUS</strong></h3>\n<br>` + `${i}) <strong>${question_category}</strong>` + " " + `<em>${bonus_format}</em>` + " " + bonus_question + "<br><br>" + "<strong>ANSWER:</strong> " + bonus_answer + "<br><br><hr><br>";
              htmlContent = htmlContent.replace(/\n/g, "<br>");
              finalizedHTML += htmlContent;
          }
          newGeneratedRound = new generatedRound({
            htmlContent: finalizedHTML,
            requestedBy: interaction.user.id,
            authorTag: interaction.user.tag,
            timestamp: new Date().toISOString(),
          });
          newGeneratedRound.save((err, round) => {
            if (err) {
              console.log(err);
              return;
            }
            interaction.reply(`Here's your round: https://api.adawesome.tech/round/${round._id.toString()}`, { ephemeral: true });
          });
        });
  } else if (action === "list"){
    let rounds = await generatedRound.find({ requestedBy: interaction.user.id }).sort({ timestamp: -1 });
    let finalMessage = "";
    if (!rounds) {
      interaction.reply("You haven't requested any rounds!");
      return;
    }

    if (rounds.length > 5) {
      rounds = rounds.slice(0, 5);
    }

    rounds.forEach(async (item, index) => {
      finalMessage += `${index + 1}. [${item.timestamp.split("T")[0]}](https://api.adawesome.tech/round/${item._id.toString()})\n`;
    });

    const roundsEmbed = new Discord.MessageEmbed()
      .setAuthor(interaction.user.tag, interaction.user.displayAvatarURL())
      .setTitle(`Last 5 rounds requested by ${interaction.user.tag}`)
      .setDescription(finalMessage)
      .setTimestamp();

    interaction.reply({
      embeds: [roundsEmbed],
      ephemeral: true
    });
  } else if (action === "hit"){
    let totalCount = await generatedRound.countDocuments({});
    let userCount = await generatedRound.countDocuments({ requestedBy: interaction.user.id });

    interaction.reply(`Total Hits: ${totalCount}\nYour Hits: ${userCount}`);
  }
}

client.on("interaction", interaction => {
  // If the interaction isn't a slash command, return
  if (!interaction.isCommand()) return;

  switch(interaction.commandName) {
    case "help":
      sendHelpMessage(interaction);
      break;
    case "train":
      training(interaction.options[0] ? interaction.options[0].value : null, interaction);
      break;
    case "rounds":
      rounds(interaction.options[0].name, interaction);
      break;
    case "top":
      showLeaderboard(interaction);
      break;
    case "about":
      about(interaction.options[0].name, interaction);
      break;
    case "iss":
      showIssLocation(interaction);
      break;
  }
})

client
  .login(process.env.TOKEN)
  .then(() => console.log("Running!"))
  .catch((error) => console.log(error));
