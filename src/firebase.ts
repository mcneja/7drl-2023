var firebaseui = require('firebaseui');
import { FirebaseApp, initializeApp } from "firebase/app";
import { updateProfile, Auth, User, onAuthStateChanged, getAuth, initializeAuth, browserSessionPersistence, 
    signInWithPopup, EmailAuthProvider, GoogleAuthProvider, FacebookAuthProvider, TwitterAuthProvider, GithubAuthProvider, signOut } from "firebase/auth";
import { getFirestore, setDoc, getDocs, getDoc, doc, collection, query, where, Firestore, Timestamp, QuerySnapshot, DocumentData } from "firebase/firestore"; 
import { userInfo } from "os";
import { format } from "path";


export class ScoreServer {
    firebaseConfig = {
        apiKey: "AIzaSyBaILJolbhEas7fzIBxAqqVwlptlpYbvq8",
        authDomain: "lurk-leap-loot.firebaseapp.com",
        projectId: "lurk-leap-loot",
        storageBucket: "lurk-leap-loot.appspot.com",
        messagingSenderId: "116296425992",
        appId: "1:116296425992:web:57e4ff993152df7981a7bd",
        measurementId: "G-T14R1XCP4B"
    };
    app:FirebaseApp;
    db:Firestore;
    user:User|null = null;
    scoreData:Array<object>|null = null;
    scoreDate:string = '';
    userScoreRanking:number = NaN; 

    constructor() {
        this.app = initializeApp(this.firebaseConfig);

        // Get a Firestore instance
        this.db = getFirestore(this.app);
    
        const auth = getAuth(this.app);
    
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.user = user;
                console.log(user);
                }
            else {
                console.log('no user');
                this.user = null;
            }
        });

        // const div = document.getElementById("server-config") as HTMLElement;
        // if(div!==null) {
        //     div.style.display = 'none';
        // }
        // const div2 = document.getElementById("server-login") as HTMLElement;
        // if(div2!==null) {
        //     div2.style.display = 'none';
        // }
        

    }
    openSignInPopup(closeNotification:()=>void) {
        const auth = getAuth(this.app);
        let div = document.getElementById("server-login") as HTMLDivElement;
        if(div!==null) {
            // div.style.display = 'block';
            div.style.display = 'flex';
            // div.style.visibility = 'visible';
            var ui = new firebaseui.auth.AuthUI(auth);
            ui.start('#firebaseui-auth-container', {
                // signInFlow: 'popup',
                signInOptions: [ 
                    EmailAuthProvider.PROVIDER_ID,
                    GoogleAuthProvider.PROVIDER_ID,
                    // TwitterAuthProvider.PROVIDER_ID,
                    // FacebookAuthProvider.PROVIDER_ID,
                    // GithubAuthProvider.PROVIDER_ID,
                ],
                callbacks: {
                    signInSuccessWithAuthResult: () => this.closeSigninPopup(closeNotification),
                }
            });
            return true;
        }
        return false;
    }
    closeSigninPopup(closeNotification:()=>void):boolean {
        let div = document.getElementById("server-login") as HTMLElement;
        if(div!==null) {
            div.style.display = 'none';
            // div.style.visibility = 'hidden';
        }
        closeNotification();
        return false;
    }
    async submitConfig(displayName: HTMLInputElement) {
        const auth = getAuth(this.app);
        const user = auth.currentUser;
        const sm = document.getElementById("servermessage")
        if(sm===null) {
            return;
        }
        if(user===null) {
            if(sm) sm.innerHTML = "Not logged in as a user. Close this dialog and login.";
            return;
        } 
        try {
            const uid = user.uid;
            const profresult = await updateProfile(user, {
                displayName: displayName.value.slice(0,20),
            })
    
            const result = await setDoc(doc(this.db, 'display_names', uid), {
                display_name: displayName.value.slice(0,20),
            });
            sm.innerHTML = "Display name updated";
        }
        catch(error) {
            if(typeof error === 'object' && error!==null && 'message' in error && typeof error.message === 'string') {
                sm.innerHTML = error.message;    
            }
        }
    }
    openConfigPopup(closeNotification:()=>void) {
        const auth = getAuth(this.app);
        if(!auth.currentUser) return false;
        const sm = document.getElementById("servermessage") as HTMLInputElement;
        if(sm===null) return false;
        sm.innerHTML = '';
        const dname = document.getElementById("displayname") as HTMLInputElement;
        if(dname===null) return false;
        dname.value = auth.currentUser.displayName ?? '';
        // dname.onchange = () => {
        //     const sm = document.getElementById("servermessage"); 
        //     if (sm) sm.innerHTML = "";
        // }
        const submit = document.getElementById("serversubmit") as HTMLButtonElement;
        submit.onclick = () => this.submitConfig(dname);
        const close = document.getElementById("serverclose") as HTMLButtonElement;
        close.onclick = () => this.closeConfigPopup(closeNotification);
        const div = document.getElementById("server-config") as HTMLDivElement;
        if(div===null) return false;
        // div.style.display = 'block';
        div.style.display = 'flex';

        // div.style.visibility = 'visible';
        //TODO: register handlers for submit and close
        return true;
    }
    closeConfigPopup(closeNotification:()=>void) {
        console.log('Close server-config');
        let div = document.getElementById("server-config") as HTMLDivElement;
        if(div!==null) {
            console.log('Hiding div');
            div.style.display = 'none';
            // div.style.visibility = 'hidden';
            // div.style.zIndex = '0';
            var a = div.offsetHeight;
            closeNotification();
        }
    }
    async signOut() {
        const auth = getAuth(this.app);
        return signOut(auth);
    }
    async getUserScore(date:string) {

    }
    async addScore(score: number, turns: number, level:number) {
        const date = new Date();
        const uid = this.user?.uid;
        if(!uid) {
            console.log('No user active -- store cannot be uploaded to server');
            return;
        }
        const scoreData = {
            score: score,
            turns: turns,
            level: level,
            date: Timestamp.fromDate(date),
        };

        console.log(this.user);
        console.log(getAuth(this.app));
        const dt = new Date(date);
        const docId = uid + "_" + dt.getUTCFullYear() + "_" + (dt.getUTCMonth()+1) + "_" + dt.getUTCDate();
        console.log(docId);
        // Add a new document with a generated id.
            setDoc(doc(this.db, 'daily_challenge_scores', docId), scoreData)
            .then((result)=>{console.log('Added score')})
            .catch((error)=>{console.log(error)});
    }
    async getScoresForDate(date: string) {
        console.log('Get scores for date',date);
        this.scoreDate = '';
        this.scoreData = null;
        this.userScoreRanking = NaN;
        var dt = new Date(date);
        dt = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
        console.log(dt);
        const startDate = Timestamp.fromDate(dt);
        dt.setDate(dt.getDate()+1);
        const endDate = Timestamp.fromDate(dt);
        console.log('date_range', startDate, endDate, startDate.toDate(), endDate.toDate());
      
        const scoreRef = await collection(this.db, 'daily_challenge_scores');
        const scoreQ = await query(scoreRef, 
            where('date', '>=', startDate),
            where('date', '<', endDate));
        const docSnap = await getDocs(scoreQ);
        const table:Array<object> = [];
        for(let d of docSnap.docs) {
            const uid = d.id.split('_',1)[0];
            console.log('uid',uid);
            const dnameRef = doc(this.db, 'display_names', uid);
            const dnameSnap = await getDoc(dnameRef);
            const dname = dnameSnap.exists()? dnameSnap.data()['display_name']: '';
            const row = {uid: uid, dname:dname, ...d.data()};
            table.push(row);
        }
        this.scoreData = table.sort((a,b)=> -(a['level']-b['level'])*10000000 - (a['score']-b['score'])*100000 + (a['turns']-b['turns']))
        this.scoreDate = date;
        if(this.user?.uid) {
            const uid = this.user.uid;
            this.userScoreRanking = table.findIndex((row)=>{console.log(row['uid'],uid,row['uid']==uid);return row['uid']==uid;})+1;
        }
        if(this.userScoreRanking===0) {
            this.userScoreRanking = NaN;
        }
    }
    getFormattedScoreData(begin:number, count:number, sortby:string):[string, string, number, number] {
        if(this.scoreData===null) return['','', 0, 0];
        let formattedTable = '    '+'Name'.padEnd(21)+'Lvl'.padEnd(5)+'Score'.padEnd(6)+'Turns'.padEnd(7)+'\n\n';
        const uid = this.user?.uid;
        const min = Math.max(Math.min(begin, this.scoreData.length-count),0);
        const max = this.scoreData.length-min;
        for(let i=min; i<max; ++i) {
            const row = this.scoreData[i];
            const name = row['dname']!=''?row['dname']:row['uid'];
            const prefix = (row['uid']===uid)? ' #80# ':'    ';
            formattedTable += prefix+name.slice(0,20).padEnd(21) + String(row['level']).padEnd(5) + String(row['score']).padEnd(6) + String(row['turns']).padEnd(7)+'\n';
        }
        for(let i=max-min; i<count; ++i) {
            formattedTable += '\n';
        }
        if(this.scoreData.length==0) {
            formattedTable += 'No scores submitted.'
        }
        return [formattedTable, this.scoreDate, min, max-min];
    }
}
