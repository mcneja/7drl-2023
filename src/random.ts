import * as seedrandom from "seedrandom";

export { randomInRange, shuffleArray, seedRandom, RNG };

class RNG {
    seed:string;
    rng:seedrandom.PRNG;
    constructor(seed:string = '') {
        if(seed!=='') {
            this.seed = seed;
            this.rng = seedrandom(seed);
        } else {
            this.seed = '';
            this.rng = seedrandom();    
        }
    }
    random() {
        return this.rng();
    }
    randomInRange(n:number) {
        return Math.floor(this.rng() * n);
    }
    shuffleArray<T>(array: Array<T>) {
        for (let i = array.length - 1; i > 0; --i) {
            let j = this.randomInRange(i + 1);
            let temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
    }
}

function seedRandom(seed:string) {
    seedrandom(seed, {global:true});
}

function randomInRange(n: number): number {
    return Math.floor(Math.random() * n);
}

function shuffleArray<T>(array: Array<T>) {
    for (let i = array.length - 1; i > 0; --i) {
        let j = randomInRange(i + 1);
        let temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
