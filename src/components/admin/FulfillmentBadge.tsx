interface FulfillmentBadgeProps {
  isConfirmed: boolean;
  isFulfilled: boolean;
}

const FulfillmentBadge = ({ isConfirmed, isFulfilled }: FulfillmentBadgeProps) => {
  if (isFulfilled) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800">
        Fulfilled
      </span>
    );
  }
  if (isConfirmed) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
        Confirmed
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
      Unconfirmed
    </span>
  );
};

export default FulfillmentBadge;
