var score_1 = 0;
var score_2 = 0;
var rollNo = 1;

function roll(){

    dice_1 = Math.floor(Math.random() * 6) + 1;
    dice_2 = Math.floor(Math.random() * 6) + 1;

    document.getElementById("dice_1").src = "./images/dice_" + dice_1 + ".png";
    document.getElementById("dice_2").src = "./images/dice_" + dice_2 + ".png";

    if(dice_1 == 1 && dice_2 == 1){
        if(rollNo % 2 == 1){
            score_1 = 0;
            rollNo += 1;
        }
        else{
            score_2 = 0;
            rollNo += 1;
        }
    }
    else if(dice_1 == dice_2){
        if(rollNo % 2 == 1){
            score_1 += (dice_1 + dice_2);
            rollNo += 2;
        }
        else{
            score_2 += (dice_1 + dice_2);
            rollNo += 2;
        }
    }
    else{
        if(rollNo % 2 == 1){
            score_1 += (dice_1 + dice_2);
            rollNo += 1;
        }
        else{
            score_2 += (dice_1 + dice_2);
            rollNo += 1;
        }
    }
    
    document.getElementById("a").innerHTML = score_1;
    document.getElementById("b").innerHTML = score_2;

    if(score_1 >= 100){
        document.getElementById("c").innerHTML = "Player 1 wins...";
        document.getElementById("player_1").style.border = "5px solid #C8B6E2";
        document.getElementById("but_1").disabled = true;
        document.getElementById('but_1').classList.remove("hover");
    }
    else if(score_2 >= 100){
        document.getElementById("c").innerHTML = "Player 2 wins...";
        document.getElementById("player_2").style.border = "5px solid #C8B6E2";
        document.getElementById("but_1").disabled = true;
        document.getElementById('but_1').classList.remove("hover");
    }
    else if(rollNo % 2 == 1){
        document.getElementById("c").innerHTML = "Player 1's turn...";
        document.getElementById("a").style.backgroundColor = "#A5C9CA";
        document.getElementById("b").style.backgroundColor = "#354259";
    }
    else{
        document.getElementById("c").innerHTML = "Player 2's turn...";
        document.getElementById("b").style.backgroundColor = "#A5C9CA";
        document.getElementById("a").style.backgroundColor = "#354259";
    }
}