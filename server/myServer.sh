for (( i=1;i<=$1;i++ ))
do
    export GRPC=$i;
    node server.js &
done
