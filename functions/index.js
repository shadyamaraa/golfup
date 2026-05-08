const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Triggered when a new notification is written to /notifications/{userId}/{notifId}
exports.sendPushOnNotification = functions.database
  .ref('/notifications/{userId}/{notifId}')
  .onCreate(async (snap, context) => {
    const notif = snap.val();
    const { userId } = context.params;

    const userSnap = await admin.database().ref(`users/${userId}`).once('value');
    const user = userSnap.val();

    if (!user || user.notifyWeb === false || !user.fcmToken) return null;

    const line1 = notif.type === 'invite'
      ? `${notif.from} таныг тоглолтод урилаа!`
      : `${notif.from} шинэ тоглолт үүсгэлээ!`;
    const body = `${notif.gameDate} ${notif.gameTime} — ${notif.gameLocation}`;

    await admin.messaging().send({
      token: user.fcmToken,
      data: {
        title: `⛳ GolfUp: ${line1}`,
        body,
        gameId: notif.gameId || ''
      },
      webpush: {
        notification: {
          title: `⛳ GolfUp: ${line1}`,
          body,
          icon: 'https://ubgolf.club/icon-192.png'
        },
        fcm_options: {
          link: notif.gameId ? `https://ubgolf.club/#/game/${notif.gameId}` : 'https://ubgolf.club/'
        }
      }
    });

    console.log(`FCM push sent to user ${userId} for notif ${context.params.notifId}`);
    return null;
  });
